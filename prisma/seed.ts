import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_BACKUP_SETTING, DEFAULT_BUSINESS_SETTING, DEFAULT_PRINTING_SETTING, DEFAULT_SHORTCUT_SETTING, ownerPinSchema, passwordSchema, PERMISSIONS, ROLE_PERMISSIONS } from "@oil-agency/shared";

const prisma = new PrismaClient();

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

async function main() {
  for (const [code, description] of Object.entries(permissionDescriptions)) {
    await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
  }

  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({ where: { code }, update: { name: code[0] + code.slice(1).toLowerCase(), isSystem: true }, create: { code, name: code[0] + code.slice(1).toLowerCase(), isSystem: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const records = await prisma.permission.findMany({ where: { code: { in: [...permissions] } } });
    await prisma.rolePermission.createMany({ data: records.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: "OWNER" } });
  const username = (process.env.SEED_OWNER_USERNAME ?? "owner").toLowerCase();
  const password = passwordSchema.parse(process.env.SEED_OWNER_PASSWORD);
  const pin = ownerPinSchema.parse(process.env.SEED_OWNER_PIN);
  await prisma.user.upsert({
    where: { username },
    update: { roleId: ownerRole.id, isActive: true },
    create: { username, displayName: "Business Owner", passwordHash: await argon2.hash(password), ownerPinHash: await argon2.hash(pin), roleId: ownerRole.id },
  });

  for (const unit of [{ name: "Tin", symbol: "tin" }, { name: "Balti", symbol: "balti" }, { name: "Bottle", symbol: "btl" }, { name: "Pouch", symbol: "pouch" }, { name: "Tray", symbol: "tray" }, { name: "Box", symbol: "box" }, { name: "Pack", symbol: "pack" }]) {
    await prisma.unit.upsert({ where: { symbol: unit.symbol }, update: unit, create: unit });
  }
  for (const name of ["Cooking Oil", "Ghee"]) await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  for (const name of ["Freight", "Loading & Unloading", "Food & Refreshments", "Utilities", "Rent", "Salary & Wages", "Vehicle & Fuel", "Repairs & Maintenance", "Office Supplies", "Other"]) {
    await prisma.expenseCategory.upsert({ where: { name }, update: { isActive: true, deletedAt: null }, create: { name } });
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
  for (const account of accounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: { name: account.name, type: account.type, normalBalance: account.normalBalance, systemCode: "systemCode" in account ? account.systemCode : undefined, isSystem: true, isActive: true, deletedAt: null },
      create: { ...account, isSystem: true },
    });
  }
  const expenseAccount = await prisma.account.findUniqueOrThrow({ where: { systemCode: "EXPENSE_GENERAL" } });
  await prisma.expenseCategory.updateMany({ where: { accountId: null }, data: { accountId: expenseAccount.id } });
  const year = new Date().getFullYear();
  await prisma.financialPeriod.upsert({
    where: { name: `${year}` },
    update: {},
    create: { name: `${year}`, startDate: new Date(Date.UTC(year, 0, 1, 12)), endDate: new Date(Date.UTC(year, 11, 31, 12)) },
  });
  for (const [key, value] of Object.entries({ business: DEFAULT_BUSINESS_SETTING, shortcuts: DEFAULT_SHORTCUT_SETTING, printing: DEFAULT_PRINTING_SETTING, backup: DEFAULT_BACKUP_SETTING })) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, valueJson: JSON.stringify(value) } });
  }
}

main().then(() => console.log("Database seeded successfully.")).finally(() => prisma.$disconnect());
