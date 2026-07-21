import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type { BackupService } from "./backup.service.js";

export class RestoreService {
  constructor(
    private readonly databasePath: string,
    private readonly backups: BackupService,
    private readonly stopDatabase: () => Promise<void>,
  ) {}

  async verify(filePath: string) {
    const database = await this.backups.decryptToBuffer(filePath);
    const candidate = path.join(path.dirname(this.databasePath), `.verify-${randomUUID()}.db`);
    await mkdir(path.dirname(candidate), { recursive: true });
    await writeFile(candidate, database, { flag: "wx", mode: 0o600 });
    try { await assertIntegrity(candidate); }
    finally { await unlink(candidate).catch(() => undefined); }
    return { valid: true, databaseBytes: database.byteLength };
  }

  async restore(filePath: string) {
    const database = await this.backups.decryptToBuffer(filePath);
    const directory = path.dirname(this.databasePath);
    const candidate = path.join(directory, `.restore-${randomUUID()}.db`);
    const rollback = path.join(directory, `.rollback-${randomUUID()}.db`);
    await mkdir(directory, { recursive: true });
    await writeFile(candidate, database, { flag: "wx", mode: 0o600 });
    await assertIntegrity(candidate);
    await this.backups.create("PRE_RESTORE", false);
    await this.stopDatabase();
    try {
      await unlink(`${this.databasePath}-wal`).catch(() => undefined);
      await unlink(`${this.databasePath}-shm`).catch(() => undefined);
      await rename(this.databasePath, rollback);
      await rename(candidate, this.databasePath);
      await assertIntegrity(this.databasePath);
      await unlink(rollback);
      return { restored: true };
    } catch (error) {
      await unlink(this.databasePath).catch(() => undefined);
      await rename(rollback, this.databasePath).catch(() => undefined);
      await unlink(candidate).catch(() => undefined);
      throw new Error(`Restore failed and the previous database was recovered: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
}

async function assertIntegrity(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("PRAGMA integrity_check").all() as Array<Record<string, string>>;
    const values = rows.flatMap((row) => Object.values(row));
    if (values.length !== 1 || values[0]?.toLowerCase() !== "ok") throw new Error(`SQLite integrity_check failed: ${values.join("; ") || "no result"}`);
  } finally {
    db.close();
  }
}
