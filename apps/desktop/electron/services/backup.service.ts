import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppDbClient, BackupKind, JobType, JobStatus } from "../../../api/src/lib/db.js";
import type { SecureStorageService } from "./secure-storage.service.js";
import type { JobQueueService } from "./job-queue.service.js";

const MAGIC = "OILPOS-BACKUP-V1";
const KEY_NAME = "backup.encryption-key";

export type BackupHeader = { magic: typeof MAGIC; createdAt: string; iv: string; tag: string; checksumSha256: string; databaseBytes: number };

export class BackupService {
  readonly backupDirectory: string;

  constructor(
    private readonly db: AppDbClient,
    userDataPath: string,
    private readonly secureStorage: SecureStorageService,
    private readonly jobs: JobQueueService,
  ) {
    this.backupDirectory = path.join(userDataPath, "backups");
  }

  async create(kind: BackupKind = "MANUAL", enqueueUpload = true) {
    await mkdir(this.backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sqlitePath = path.join(this.backupDirectory, `.snapshot-${stamp}.db`);
    const fileName = `oil-pos-${stamp}.oilbackup`;
    const finalPath = path.join(this.backupDirectory, fileName);
    await this.db.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL)");
    await this.db.$executeRawUnsafe("VACUUM INTO ?", sqlitePath);
    try {
      const database = await readFile(sqlitePath);
      const key = await this.encryptionKey();
      const encrypted = encryptBackup(database, key, new Date());
      const temporary = `${finalPath}.tmp`;
      await writeFile(temporary, encrypted.file, { mode: 0o600 });
      await rename(temporary, finalPath);
      const details = await stat(finalPath);
      const record = await this.db.backupRecord.create({ data: { fileName, localPath: finalPath, checksumSha256: encrypted.header.checksumSha256, sizeBytes: details.size, kind } });
      await this.db.auditLog.create({ data: { action: "BACKUP", entityType: "Database", entityId: record.id, afterJson: JSON.stringify({ fileName, sizeBytes: details.size, kind, encrypted: true }) } });
      if (enqueueUpload) await this.jobs.enqueue("GOOGLE_DRIVE_UPLOAD", `drive:${record.id}`, { backupId: record.id });
      await this.applyRetention();
      return record;
    } finally {
      await unlink(sqlitePath).catch(() => undefined);
    }
  }

  async list() {
    const records = await this.db.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return records.map(normalizeBackupRecord);
  }

  async decryptToBuffer(filePath: string) {
    return decryptBackup(await readFile(filePath), await this.encryptionKey());
  }

  async import(filePath: string) {
    const database = await this.decryptToBuffer(filePath);
    const importedName = `imported-${new Date().toISOString().replace(/[:.]/g, "-")}.oilbackup`;
    const destination = path.join(this.backupDirectory, importedName);
    await mkdir(this.backupDirectory, { recursive: true });
    await writeFile(destination, await readFile(filePath), { flag: "wx", mode: 0o600 });
    const details = await stat(destination);
    return this.db.backupRecord.create({ data: { fileName: importedName, localPath: destination, checksumSha256: sha256(database), sizeBytes: details.size, kind: "IMPORTED" } });
  }

  private async encryptionKey() {
    const stored = await this.secureStorage.get(KEY_NAME);
    if (stored) {
      const key = Buffer.from(stored, "base64");
      if (key.byteLength !== 32) throw new Error("The protected backup encryption key is invalid.");
      return key;
    }
    const key = randomBytes(32);
    await this.secureStorage.set(KEY_NAME, key.toString("base64"));
    return key;
  }

  private async applyRetention() {
    const records = (await this.db.backupRecord.findMany({ where: { kind: { in: ["AUTOMATIC", "MANUAL"] } }, orderBy: { createdAt: "desc" } })).map(normalizeBackupRecord);
    const keep = retentionIds(records.map((row) => ({ id: row.id, createdAt: row.createdAt })));
    for (const row of records) {
      if (keep.has(row.id)) continue;
      await unlink(row.localPath).catch(() => undefined);
      await this.db.backgroundJob.deleteMany({ where: { dedupeKey: `drive:${row.id}` } });
      await this.db.backupRecord.delete({ where: { id: row.id } });
    }
    await readdir(this.backupDirectory).catch(() => []);
  }
}

function normalizeBackupRecord<T extends { createdAt: unknown; driveUploadedAt?: unknown }>(record: T) {
  return {
    ...record,
    createdAt: coerceDate(record.createdAt),
    ...(record.driveUploadedAt !== undefined
      ? { driveUploadedAt: coerceOptionalDate(record.driveUploadedAt) }
      : {}),
  };
}

function coerceOptionalDate(value: unknown) {
  return value == null ? value : coerceDate(value);
}

function coerceDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}.000Z`
      : value;
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

export function encryptBackup(database: Buffer, key: Buffer, now = new Date()) {
  if (key.byteLength !== 32) throw new Error("AES-256-GCM requires a 32-byte key.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(database), cipher.final()]);
  const header: BackupHeader = { magic: MAGIC, createdAt: now.toISOString(), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), checksumSha256: sha256(database), databaseBytes: database.byteLength };
  return { header, file: Buffer.concat([Buffer.from(`${JSON.stringify(header)}\n`, "utf8"), ciphertext]) };
}

export function decryptBackup(file: Buffer, key: Buffer) {
  const newline = file.indexOf(10);
  if (newline < 0 || newline > 8_192) throw new Error("Backup header is missing or too large.");
  const header = JSON.parse(file.subarray(0, newline).toString("utf8")) as BackupHeader;
  if (header.magic !== MAGIC || !/^[a-f0-9]{64}$/.test(header.checksumSha256)) throw new Error("This is not a supported Oil POS backup.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
  decipher.setAuthTag(Buffer.from(header.tag, "base64"));
  let database: Buffer;
  try { database = Buffer.concat([decipher.update(file.subarray(newline + 1)), decipher.final()]); }
  catch { throw new Error("Backup authentication failed. The file is damaged or belongs to another installation."); }
  if (database.byteLength !== header.databaseBytes || sha256(database) !== header.checksumSha256) throw new Error("Backup checksum verification failed.");
  return database;
}

export function retentionIds(rows: Array<{ id: string; createdAt: Date }>) {
  const keep = new Set<string>();
  keepBuckets(rows, keep, 7, (date) => date.toISOString().slice(0, 10));
  keepBuckets(rows, keep, 4, (date) => isoWeek(date));
  keepBuckets(rows, keep, 6, (date) => date.toISOString().slice(0, 7));
  return keep;
}

function keepBuckets(rows: Array<{ id: string; createdAt: Date }>, keep: Set<string>, limit: number, bucket: (date: Date) => string) {
  const found = new Set<string>();
  for (const row of rows) { const key = bucket(row.createdAt); if (found.has(key)) continue; found.add(key); keep.add(row.id); if (found.size >= limit) break; }
}
function isoWeek(input: Date) { const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7)); const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); return `${date.getUTCFullYear()}-${String(Math.ceil(((date.getTime() - start.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`; }
function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
