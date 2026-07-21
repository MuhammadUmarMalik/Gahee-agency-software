import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { shell } from "electron";
import type { AppDbClient, BackupKind, JobType, JobStatus } from "../../../api/src/lib/db.js";
import type { SecureStorageService } from "./secure-storage.service.js";

const TOKEN_KEY = "google.oauth.tokens";
const CLIENT_KEY = "google.oauth.client-id";
const FOLDER_NAME = "Oil POS Backups";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
type GoogleTokens = { accessToken: string; refreshToken: string; expiresAt: number };

export class GoogleDriveService {
  constructor(private readonly db: AppDbClient, private readonly secureStorage: SecureStorageService) {}

  async status() {
    return { connected: Boolean(await this.secureStorage.get(TOKEN_KEY)), clientConfigured: Boolean(await this.secureStorage.get(CLIENT_KEY)) };
  }

  async connect(clientId: string) {
    if (!clientId.trim()) throw new Error("Google Desktop OAuth client ID is required.");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("base64url");
    const result = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://127.0.0.1`);
        if (url.pathname !== "/oauth2/callback") { response.writeHead(404).end(); return; }
        if (url.searchParams.get("state") !== state) { response.writeHead(400).end("Invalid OAuth state."); server.close(); reject(new Error("Google OAuth state validation failed.")); return; }
        const code = url.searchParams.get("code");
        if (!code) { response.writeHead(400).end("Google authorization was not completed."); server.close(); reject(new Error(url.searchParams.get("error") ?? "Google authorization failed.")); return; }
        const address = server.address();
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Oil POS is connected. You may close this tab.");
        server.close();
        resolve({ code, redirectUri: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/oauth2/callback` });
      });
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address();
        if (!address || typeof address === "string") return reject(new Error("Could not start the local OAuth callback."));
        const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({ client_id: clientId.trim(), redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state }).toString();
        await shell.openExternal(url.toString()).catch(reject);
      });
      server.setTimeout(180_000, () => { server.close(); reject(new Error("Google authorization timed out.")); });
    });
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId.trim(), code: result.code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: result.redirectUri }), signal: AbortSignal.timeout(20_000) });
    const body = await json(response);
    if (!response.ok || typeof body.access_token !== "string" || typeof body.refresh_token !== "string") throw new Error(externalError(body, "Google token exchange failed."));
    await this.secureStorage.set(CLIENT_KEY, clientId.trim());
    await this.secureStorage.set(TOKEN_KEY, JSON.stringify({ accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 } satisfies GoogleTokens));
    await this.ensureFolder();
    return { connected: true };
  }

  async disconnect() {
    const tokens = await this.tokens(false);
    if (tokens) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    await this.secureStorage.delete(TOKEN_KEY);
    return { connected: false };
  }

  async uploadBackup(backupId: string) {
    const backup = await this.db.backupRecord.findUniqueOrThrow({ where: { id: backupId } });
    if (backup.driveFileId) return backup;
    const token = await this.accessToken();
    const duplicate = await this.findByChecksum(token, backup.checksumSha256);
    const driveFileId = duplicate ?? await this.upload(token, backup.localPath, backup.fileName, backup.checksumSha256, await this.ensureFolder(token));
    return this.db.backupRecord.update({ where: { id: backup.id }, data: { driveFileId, driveUploadedAt: new Date() } });
  }

  async listBackups() {
    const token = await this.accessToken();
    const folderId = await this.ensureFolder(token);
    const query = `'${folderId}' in parents and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,appProperties)&orderBy=createdTime desc&pageSize=100`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const body = await json(response);
    if (!response.ok) throw new Error(externalError(body, "Could not list Google Drive backups."));
    return Array.isArray(body.files) ? body.files : [];
  }

  async download(fileId: string, destination: string) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new Error("Invalid Google Drive file ID.");
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Google Drive download failed with HTTP ${response.status}.`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > 2_000_000_000) throw new Error("Backup is too large to restore.");
    await writeFile(destination, data, { flag: "wx", mode: 0o600 });
    return destination;
  }

  private async ensureFolder(existingToken?: string) {
    const token = existingToken ?? await this.accessToken();
    const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const lookup = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const found = await json(lookup);
    if (!lookup.ok) throw new Error(externalError(found, "Could not find the Google Drive backup folder."));
    if (Array.isArray(found.files) && typeof found.files[0]?.id === "string") return found.files[0].id as string;
    const created = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }), signal: AbortSignal.timeout(20_000) });
    const body = await json(created);
    if (!created.ok || typeof body.id !== "string") throw new Error(externalError(body, "Could not create the Google Drive backup folder."));
    return body.id as string;
  }

  private async findByChecksum(token: string, checksum: string) {
    const query = `appProperties has { key='oilPosChecksum' and value='${checksum}' } and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const body = await json(response);
    if (!response.ok) throw new Error(externalError(body, "Could not check Google Drive for duplicate backups."));
    return Array.isArray(body.files) && typeof body.files[0]?.id === "string" ? body.files[0].id as string : null;
  }

  private async upload(token: string, localPath: string, fileName: string, checksum: string, folderId: string) {
    const boundary = `oilpos-${randomBytes(18).toString("hex")}`;
    const metadata = Buffer.from(JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/octet-stream", appProperties: { oilPosChecksum: checksum } }));
    const file = await readFile(localPath);
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`), metadata, Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`), file, Buffer.from(`\r\n--${boundary}--`)]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(120_000) });
    const result = await json(response);
    if (!response.ok || typeof result.id !== "string") throw new Error(externalError(result, "Google Drive upload failed."));
    return result.id as string;
  }

  private async accessToken() {
    const tokens = await this.tokens(true);
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
    const clientId = await this.secureStorage.get(CLIENT_KEY);
    if (!clientId) throw new Error("Google OAuth client is not configured.");
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, refresh_token: tokens.refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20_000) });
    const body = await json(response);
    if (!response.ok || typeof body.access_token !== "string") throw new Error(externalError(body, "Google access token refresh failed."));
    const updated = { ...tokens, accessToken: body.access_token as string, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
    await this.secureStorage.set(TOKEN_KEY, JSON.stringify(updated));
    return updated.accessToken;
  }

  private async tokens(required: true): Promise<GoogleTokens>;
  private async tokens(required: false): Promise<GoogleTokens | null>;
  private async tokens(required: boolean) {
    const value = await this.secureStorage.get(TOKEN_KEY);
    if (!value) { if (required) throw new Error("Google Drive is not connected."); return null; }
    try { const parsed = JSON.parse(value) as GoogleTokens; if (!parsed.accessToken || !parsed.refreshToken || !Number.isFinite(parsed.expiresAt)) throw new Error(); return parsed; }
    catch { throw new Error("Stored Google credentials are invalid. Disconnect and connect again."); }
  }
}

async function json(response: Response): Promise<Record<string, any>> { const text = await response.text(); try { return JSON.parse(text) as Record<string, any>; } catch { return {}; } }
function externalError(body: Record<string, any>, fallback: string) { const value = body.error?.message ?? body.error_description ?? body.error; return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000) : fallback; }
