import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";

type SecretMap = Record<string, string>;

export class SecureStorageService {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "secure", "credentials.json");
  }

  async get(key: string): Promise<string | null> {
    const values = await this.read();
    const encrypted = values[key];
    if (!encrypted) return null;
    this.assertAvailable();
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      throw new Error(`The protected credential '${key}' could not be decrypted on this computer.`);
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.assertAvailable();
    if (!value.trim()) throw new Error("A protected credential cannot be empty.");
    const values = await this.read();
    values[key] = safeStorage.encryptString(value).toString("base64");
    await this.write(values);
  }

  async delete(key: string): Promise<void> {
    const values = await this.read();
    delete values[key];
    await this.write(values);
  }

  private assertAvailable() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Operating-system credential encryption is unavailable. Credentials were not stored.");
    }
  }

  private async read(): Promise<SecretMap> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SecretMap) : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Protected credential storage is corrupted or unreadable.");
    }
  }

  private async write(values: SecretMap) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(values), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
