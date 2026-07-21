import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const REQUIRED_TABLES = [
  "Account", "AuditLog", "BackgroundJob", "BackupRecord", "BankAccount", "Brand",
  "CashbookEntry", "Category", "Customer", "CustomerLedger", "DailyClosing",
  "DamageEntry", "DiscountApproval", "Expense", "ExpenseCategory", "FinancialPeriod",
  "FinancialTransaction", "HeldSale", "JournalEntry", "JournalLine", "LoginHistory",
  "Payment", "Permission", "Product", "ProductBatch", "ProductPacking", "Purchase",
  "PurchaseItem", "PurchaseReturn", "PurchaseReturnItem", "Role", "RolePermission",
  "Sale", "SaleItem", "SalesReturn", "SalesReturnItem", "SalesReturnReplacementItem",
  "Session", "Setting", "StockCount", "StockCountItem", "StockMovement", "Supplier",
  "SupplierLedger", "Unit", "User",
] as const;

type MigrationEntry = { idx: number; when: number; tag: string };

export function resolveDatabasePath(databaseUrl = process.env.DATABASE_URL ?? "file:./data/agency.db") {
  const withoutProtocol = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;
  return path.isAbsolute(withoutProtocol) ? withoutProtocol : path.resolve(process.cwd(), withoutProtocol);
}

export function databasePathsEqual(left: string, right: string) {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

export function resolveMigrationsFolder(candidates?: string[]) {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const folders = candidates ?? [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(moduleDirectory, "../../../../drizzle"),
  ];
  const migrationsFolder = folders.find((candidate) => existsSync(path.join(candidate, "meta", "_journal.json")));
  if (!migrationsFolder) throw new Error(`Database migrations folder was not found. Checked: ${folders.join(", ")}`);
  return migrationsFolder;
}

export function configureSqlite(connection: Database.Database) {
  connection.pragma("foreign_keys = ON");
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.pragma("synchronous = NORMAL");
}

export function inspectDatabase(connection: Database.Database, databasePath: string) {
  const databases = connection.prepare("PRAGMA database_list").all() as Array<{ seq: number; name: string; file: string }>;
  const tables = (connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map(({ name }) => name);
  const missingTables = REQUIRED_TABLES.filter((name) => !tables.includes(name));
  const mainDatabase = databases.find(({ name }) => name === "main");
  if (!mainDatabase || !databasePathsEqual(mainDatabase.file, databasePath))
    throw new Error(`SQLite opened an unexpected database. Expected ${databasePath}; PRAGMA database_list=${JSON.stringify(databases)}`);
  console.info("[database] resolved path:", databasePath);
  console.info("[database] PRAGMA database_list:", databases);
  console.info("[database] tables:", tables.join(", "));
  return { databases, tables, missingTables };
}

export function migrateDatabase(databasePath: string, migrationsFolder: string) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const connection = new Database(databasePath);
  try {
    configureSqlite(connection);
    reconcileLegacyMigrationLedger(connection, migrationsFolder);
    migrate(drizzle(connection), { migrationsFolder });
    const inspection = inspectDatabase(connection, databasePath);
    if (inspection.missingTables.length) {
      throw new Error(`Database migration completed but required tables are missing: ${inspection.missingTables.join(", ")}`);
    }
    return inspection;
  } finally {
    connection.close();
  }
}

function reconcileLegacyMigrationLedger(connection: Database.Database, migrationsFolder: string) {
  const tables = new Set((connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(({ name }) => name));
  if (!tables.has("User")) return;

  connection.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  const entries = readJournal(migrationsFolder);
  const applied = new Set((connection.prepare("SELECT created_at FROM __drizzle_migrations").all() as Array<{ created_at: number }>).map(({ created_at }) => Number(created_at)));
  const repairableMissing = new Set(["Purchase", "AuditLog"]);
  const nonRepairableMissing = REQUIRED_TABLES.filter((name) => !repairableMissing.has(name) && !tables.has(name));

  const initial = entries.find(({ idx }) => idx === 0);
  if (initial && !applied.has(initial.when)) {
    if (nonRepairableMissing.length) {
      throw new Error(`Existing database has an incomplete untracked schema. Missing tables: ${nonRepairableMissing.join(", ")}`);
    }
    recordMigration(connection, migrationsFolder, initial);
    applied.add(initial.when);
  }

  const fbr = entries.find(({ idx }) => idx === 1);
  if (fbr && !applied.has(fbr.when) && tables.has("Sale")) {
    const saleColumns = new Set((connection.prepare("PRAGMA table_info('Sale')").all() as Array<{ name: string }>).map(({ name }) => name));
    if (["fbrRequestJson", "fbrQrData", "fbrRetryCount"].every((name) => saleColumns.has(name))) {
      recordMigration(connection, migrationsFolder, fbr);
      applied.add(fbr.when);
    }
  }

  // A previous packaged build could mark migrations as applied while Purchase was absent.
  // Skip the Purchase rebuild migration only in that corrupt state; the following committed
  // repair migration creates the table safely with IF NOT EXISTS.
  const purchaseRebuild = entries.find(({ idx }) => idx === 2);
  if (purchaseRebuild && !applied.has(purchaseRebuild.when) && !tables.has("Purchase")) {
    recordMigration(connection, migrationsFolder, purchaseRebuild);
  }
}

function readJournal(migrationsFolder: string) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  return (JSON.parse(readFileSync(journalPath, "utf8")) as { entries: MigrationEntry[] }).entries;
}

function recordMigration(connection: Database.Database, migrationsFolder: string, entry: MigrationEntry) {
  const sql = readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  connection.prepare("INSERT INTO __drizzle_migrations(hash, created_at) VALUES (?, ?)").run(hash, entry.when);
}
