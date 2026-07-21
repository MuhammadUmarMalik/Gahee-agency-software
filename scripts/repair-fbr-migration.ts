import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const fbrColumns = [
  { name: "fbrRequestJson", sql: "ALTER TABLE Sale ADD COLUMN fbrRequestJson text" },
  { name: "fbrQrData", sql: "ALTER TABLE Sale ADD COLUMN fbrQrData text" },
  { name: "fbrRetryCount", sql: "ALTER TABLE Sale ADD COLUMN fbrRetryCount integer DEFAULT 0 NOT NULL" },
];

function databasePath() {
  const url = process.env.DATABASE_URL ?? "file:./data/agency.db";
  const value = url.replace(/^file:/, "");
  return path.resolve(value);
}

const dbPath = databasePath();
if (!existsSync(dbPath)) process.exit(0);

const db = new Database(dbPath);
try {
  const userTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'User'")
    .get();
  if (userTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      );
    `);

    const saleTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Sale'")
      .get();
    if (saleTable) {
      const saleColumns = new Set(
        db.prepare("PRAGMA table_info('Sale')")
          .all()
          .map((column) => String((column as { name: unknown }).name)),
      );
      for (const column of fbrColumns) {
        if (!saleColumns.has(column.name)) db.prepare(column.sql).run();
      }
      db.prepare("UPDATE Sale SET fbrStatus = CASE fbrStatus WHEN 'pending' THEN 'PENDING' WHEN 'submitting' THEN 'SUBMITTING' WHEN 'submitted' THEN 'ACCEPTED' WHEN 'failed' THEN 'FAILED' WHEN 'requires_review' THEN 'REQUIRES_REVIEW' WHEN 'rejected' THEN 'REQUIRES_REVIEW' WHEN 'validated' THEN 'PENDING' WHEN 'validating' THEN 'PENDING' WHEN 'NOT_SUBMITTED' THEN 'PENDING' ELSE fbrStatus END WHERE fbrStatus != upper(fbrStatus) OR fbrStatus = 'NOT_SUBMITTED'").run();
    }

    const journal = JSON.parse(readFileSync(path.resolve("drizzle", "meta", "_journal.json"), "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    for (const entry of journal.entries) {
      if (entry.idx > 1) continue;
      const migrationPath = path.resolve("drizzle", `${entry.tag}.sql`);
      const hash = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
      const applied = db.prepare("SELECT 1 FROM __drizzle_migrations WHERE created_at = ?").get(entry.when);
      if (applied) db.prepare("UPDATE __drizzle_migrations SET hash = ? WHERE created_at = ?").run(hash, entry.when);
      else db.prepare("INSERT INTO __drizzle_migrations(hash, created_at) VALUES (?, ?)").run(hash, entry.when);
    }
    console.log(`Repaired Drizzle baseline in ${dbPath}`);
  }
} finally {
  db.close();
}
