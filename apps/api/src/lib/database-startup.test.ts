import path from "node:path";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateDatabase, REQUIRED_TABLES } from "./database-startup.js";

const repositoryMigrations = fileURLToPath(new URL("../../../../drizzle", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("database startup migrations", () => {
  it("creates and verifies every required table on a clean installation", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "oil-agency-pos", "app.db");

    const inspection = migrateDatabase(databasePath, repositoryMigrations);

    expect(inspection.missingTables).toEqual([]);
    expect(inspection.tables).toEqual(expect.arrayContaining([...REQUIRED_TABLES]));
    expect(inspection.databases.find(({ name }) => name === "main")?.file).toBe(databasePath);
  });

  it("repairs the legacy missing-table state without changing existing data", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "app.db");
    const oldMigrations = path.join(directory, "old-migrations");
    cpSync(repositoryMigrations, oldMigrations, { recursive: true });
    const journalPath = path.join(oldMigrations, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
    journal.entries = journal.entries.slice(0, 3);
    writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    migrateDatabase(databasePath, oldMigrations);

    const legacy = new Database(databasePath);
    legacy.exec(`
      DROP TABLE Purchase;
      DROP TABLE AuditLog;
      INSERT INTO Setting(key, valueJson) VALUES ('upgrade-sentinel', 'preserved');
    `);
    legacy.close();

    migrateDatabase(databasePath, repositoryMigrations);
    migrateDatabase(databasePath, repositoryMigrations);

    const upgraded = new Database(databasePath, { readonly: true });
    expect(upgraded.prepare("SELECT valueJson FROM Setting WHERE key = 'upgrade-sentinel'").pluck().get()).toBe("preserved");
    expect(upgraded.prepare("SELECT count(*) FROM Purchase").pluck().get()).toBe(0);
    expect(upgraded.prepare("SELECT count(*) FROM AuditLog").pluck().get()).toBe(0);
    expect(upgraded.pragma("integrity_check", { simple: true })).toBe("ok");
    upgraded.close();
  });
});

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "oil-pos-migrations-"));
  temporaryDirectories.push(directory);
  return directory;
}
