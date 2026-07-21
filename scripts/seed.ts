import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq, inArray, isNull } from "drizzle-orm";
import { DEFAULT_BACKUP_SETTING, DEFAULT_BUSINESS_SETTING, DEFAULT_PRINTING_SETTING, DEFAULT_SHORTCUT_SETTING, ownerPinSchema, passwordSchema, PERMISSIONS, ROLE_PERMISSIONS } from "@oil-agency/shared";
import { closeDb, orm as db } from "../apps/api/src/lib/db.js";
import { account, category, expenseCategory, financialPeriod, permission, role, rolePermission, setting, unit, user } from "../apps/api/src/db/schema.js";
import { hashSecret } from "../apps/api/src/lib/password.js";

const id = () => randomUUID();
const now = () => new Date();

const permissionDescriptions: Record<string, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "View the role-appropriate dashboard",
  [PERMISSIONS.POS_USE]: "Create sales and request discount approval",
  [PERMISSIONS.SALES_VIEW]: "View sales and invoices",
  [PERMISSIONS.SALES_RETURN]: "Create sales returns",
  [PERMISSIONS.PRODUCTS_MANAGE]: "Manage catalog master data",
  [PERMISSIONS.INVENTORY_VIEW]: "View stock and movement history",
  [PERMISSIONS.INVENTORY_ADJUST]: "Post stock adjustments and wastage",
  [PERMISSIONS.PURCHASES_MANAGE]: "Manage purchases",
  [PERMISSIONS.PARTIES_MANAGE]: "Manage customers and suppliers",
  [PERMISSIONS.PAYMENTS_MANAGE]: "Receive and issue payments",
  [PERMISSIONS.CASHBOOK_VIEW]: "View cashbook and cash in hand",
  [PERMISSIONS.CASHBOOK_MANAGE]: "Post controlled cashbook entries",
  [PERMISSIONS.CASHBOOK_CLOSE]: "Close the daily cash drawer",
  [PERMISSIONS.EXPENSES_MANAGE]: "Post and reverse agency expenses",
  [PERMISSIONS.REPORTS_BASIC]: "View operational reports",
  [PERMISSIONS.REPORTS_SENSITIVE]: "View cost, profit, and sensitive reports",
  [PERMISSIONS.ACCOUNTING_VIEW]: "View chart of accounts and journals",
  [PERMISSIONS.ACCOUNTING_MANAGE]: "Post and reverse accounting transactions",
  [PERMISSIONS.ACCOUNTING_PERIODS]: "Open, close, and lock financial periods",
  [PERMISSIONS.FINANCIAL_REPORTS]: "View financial statements",
  [PERMISSIONS.BANK_ACCOUNTS_MANAGE]: "Manage bank accounts and transfers",
  [PERMISSIONS.USERS_MANAGE]: "Manage application users",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage protected settings",
  [PERMISSIONS.BACKUP_MANAGE]: "Create and restore backups",
};

export async function seedDatabase(options: { createOwner?: boolean } = {}) {
  for (const [code, description] of Object.entries(permissionDescriptions)) {
    await db.insert(permission).values({ id: id(), code, description }).onConflictDoUpdate({ target: permission.code, set: { description } });
  }

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const roleName = code[0] + code.slice(1).toLowerCase();
    await db.insert(role).values({ id: id(), code, name: roleName, isSystem: true, createdAt: now(), updatedAt: now() }).onConflictDoUpdate({ target: role.code, set: { name: roleName, isSystem: true, updatedAt: now() } });
    const [roleRecord] = await db.select().from(role).where(eq(role.code, code)).limit(1);
    if (!roleRecord) throw new Error(`Role ${code} was not created.`);
    await db.delete(rolePermission).where(eq(rolePermission.roleId, roleRecord.id));
    const records = await db.select().from(permission).where(inArray(permission.code, [...permissions]));
    if (records.length) await db.insert(rolePermission).values(records.map((record) => ({ roleId: roleRecord.id, permissionId: record.id }))).onConflictDoNothing();
  }

  if (options.createOwner ?? process.env.SEED_CREATE_OWNER !== "false") {
    const [ownerRole] = await db.select().from(role).where(eq(role.code, "OWNER")).limit(1);
    if (!ownerRole) throw new Error("OWNER role was not created.");
    const username = (process.env.SEED_OWNER_USERNAME ?? "owner").toLowerCase();
    const password = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);
    const pin = ownerPinSchema.parse(process.env.SEED_OWNER_PIN);
    await db.insert(user).values({ id: id(), username, displayName: "Business Owner", passwordHash: await hashSecret(password), ownerPinHash: await hashSecret(pin), roleId: ownerRole.id, createdAt: now(), updatedAt: now() }).onConflictDoUpdate({ target: user.username, set: { roleId: ownerRole.id, isActive: true, updatedAt: now() } });
  }

  for (const item of [{ name: "Tin", symbol: "tin" }, { name: "Balti", symbol: "balti" }, { name: "Bottle", symbol: "btl" }, { name: "Pouch", symbol: "pouch" }, { name: "Tray", symbol: "tray" }, { name: "Box", symbol: "box" }, { name: "Pack", symbol: "pack" }]) {
    await db.insert(unit).values({ id: id(), ...item, createdAt: now(), updatedAt: now() }).onConflictDoUpdate({ target: unit.symbol, set: { ...item, updatedAt: now() } });
  }
  for (const name of ["Cooking Oil", "Ghee"]) {
    await db.insert(category).values({ id: id(), name, createdAt: now(), updatedAt: now() }).onConflictDoNothing({ target: category.name });
  }
  for (const name of ["Freight", "Loading & Unloading", "Food & Refreshments", "Utilities", "Rent", "Salary & Wages", "Vehicle & Fuel", "Repairs & Maintenance", "Office Supplies", "Other"]) {
    await db.insert(expenseCategory).values({ id: id(), name, createdAt: now(), updatedAt: now() }).onConflictDoUpdate({ target: expenseCategory.name, set: { isActive: true, deletedAt: null, updatedAt: now() } });
  }

  const accounts = [
    { code: "1000", name: "Assets", type: "ASSET", normalBalance: "DEBIT" },
    { code: "1010", name: "Cash in Hand", type: "ASSET", normalBalance: "DEBIT", systemCode: "CASH" },
    { code: "1020", name: "Bank Clearing", type: "ASSET", normalBalance: "DEBIT", systemCode: "BANK_CLEARING" },
    { code: "1100", name: "Customer Receivables", type: "ASSET", normalBalance: "DEBIT", systemCode: "AR" },
    { code: "1200", name: "Inventory", type: "ASSET", normalBalance: "DEBIT", systemCode: "INVENTORY" },
    { code: "1300", name: "Input Tax", type: "ASSET", normalBalance: "DEBIT", systemCode: "INPUT_TAX" },
    { code: "2000", name: "Liabilities", type: "LIABILITY", normalBalance: "CREDIT" },
    { code: "2100", name: "Supplier Payables", type: "LIABILITY", normalBalance: "CREDIT", systemCode: "AP" },
    { code: "2200", name: "Output Tax", type: "LIABILITY", normalBalance: "CREDIT", systemCode: "OUTPUT_TAX" },
    { code: "3000", name: "Equity", type: "EQUITY", normalBalance: "CREDIT" },
    { code: "3100", name: "Owner Capital", type: "EQUITY", normalBalance: "CREDIT", systemCode: "CAPITAL" },
    { code: "3200", name: "Owner Drawings", type: "EQUITY", normalBalance: "DEBIT", systemCode: "DRAWINGS" },
    { code: "3300", name: "Opening Balance Equity", type: "EQUITY", normalBalance: "CREDIT", systemCode: "OPENING_EQUITY" },
    { code: "3400", name: "Retained Earnings", type: "EQUITY", normalBalance: "CREDIT", systemCode: "RETAINED_EARNINGS" },
    { code: "4000", name: "Sales Revenue", type: "REVENUE", normalBalance: "CREDIT", systemCode: "SALES" },
    { code: "4100", name: "Other Income", type: "REVENUE", normalBalance: "CREDIT", systemCode: "OTHER_INCOME" },
    { code: "4200", name: "Sales Returns", type: "CONTRA_REVENUE", normalBalance: "DEBIT", systemCode: "SALES_RETURNS" },
    { code: "4300", name: "Sales Discounts", type: "CONTRA_REVENUE", normalBalance: "DEBIT", systemCode: "SALES_DISCOUNTS" },
    { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", normalBalance: "DEBIT", systemCode: "COGS" },
    { code: "5100", name: "Inventory Loss", type: "EXPENSE", normalBalance: "DEBIT", systemCode: "INVENTORY_LOSS" },
    { code: "6000", name: "Operating Expenses", type: "EXPENSE", normalBalance: "DEBIT", systemCode: "EXPENSE_GENERAL" },
    { code: "6100", name: "Cash Over and Short", type: "EXPENSE", normalBalance: "DEBIT", systemCode: "CASH_OVER_SHORT" },
  ] as const;
  for (const item of accounts) {
    await db.insert(account).values({ id: id(), ...item, isSystem: true, createdAt: now(), updatedAt: now() }).onConflictDoUpdate({ target: account.code, set: { name: item.name, type: item.type, normalBalance: item.normalBalance, systemCode: "systemCode" in item ? item.systemCode : null, isSystem: true, isActive: true, deletedAt: null, updatedAt: now() } });
  }
  const [expenseAccount] = await db.select().from(account).where(eq(account.systemCode, "EXPENSE_GENERAL")).limit(1);
  if (!expenseAccount) throw new Error("EXPENSE_GENERAL account was not created.");
  await db.update(expenseCategory).set({ accountId: expenseAccount.id, updatedAt: now() }).where(isNull(expenseCategory.accountId));

  const year = new Date().getFullYear();
  await db.insert(financialPeriod).values({ id: id(), name: `${year}`, startDate: new Date(Date.UTC(year, 0, 1, 12)), endDate: new Date(Date.UTC(year, 11, 31, 12)), createdAt: now(), updatedAt: now() }).onConflictDoNothing({ target: financialPeriod.name });
  for (const [key, value] of Object.entries({ business: DEFAULT_BUSINESS_SETTING, shortcuts: DEFAULT_SHORTCUT_SETTING, printing: DEFAULT_PRINTING_SETTING, backup: DEFAULT_BACKUP_SETTING })) {
    await db.insert(setting).values({ key, valueJson: JSON.stringify(value), updatedAt: now() }).onConflictDoNothing({ target: setting.key });
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  seedDatabase()
    .then(() => console.log("Database seeded successfully."))
    .finally(() => closeDb());
}
