import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { configureSqlite, migrateDatabase as runMigrations, resolveDatabasePath, resolveMigrationsFolder } from "./database-startup.js";

type QueryArgs = Record<string, unknown>;
type Relation = { model: ModelName; localKey: string; foreignKey: string; many?: boolean };
type ModelName = keyof typeof modelTables;
type MaybePromise<T> = T | Promise<T>;

type ModelRows = {
  account: typeof schema.account.$inferSelect;
  auditLog: typeof schema.auditLog.$inferSelect;
  backgroundJob: typeof schema.backgroundJob.$inferSelect;
  backupRecord: typeof schema.backupRecord.$inferSelect;
  bankAccount: typeof schema.bankAccount.$inferSelect;
  brand: typeof schema.brand.$inferSelect;
  cashbookEntry: typeof schema.cashbookEntry.$inferSelect;
  category: typeof schema.category.$inferSelect;
  customer: typeof schema.customer.$inferSelect;
  customerLedger: typeof schema.customerLedger.$inferSelect;
  dailyClosing: typeof schema.dailyClosing.$inferSelect;
  damageEntry: typeof schema.damageEntry.$inferSelect;
  discountApproval: typeof schema.discountApproval.$inferSelect;
  expense: typeof schema.expense.$inferSelect;
  expenseCategory: typeof schema.expenseCategory.$inferSelect;
  financialPeriod: typeof schema.financialPeriod.$inferSelect;
  financialTransaction: typeof schema.financialTransaction.$inferSelect;
  heldSale: typeof schema.heldSale.$inferSelect;
  journalEntry: typeof schema.journalEntry.$inferSelect;
  journalLine: typeof schema.journalLine.$inferSelect;
  loginHistory: typeof schema.loginHistory.$inferSelect;
  payment: typeof schema.payment.$inferSelect;
  permission: typeof schema.permission.$inferSelect;
  product: typeof schema.product.$inferSelect;
  productBatch: typeof schema.productBatch.$inferSelect;
  productPacking: typeof schema.productPacking.$inferSelect;
  purchase: typeof schema.purchase.$inferSelect;
  purchaseItem: typeof schema.purchaseItem.$inferSelect;
  purchaseReturn: typeof schema.purchaseReturn.$inferSelect;
  purchaseReturnItem: typeof schema.purchaseReturnItem.$inferSelect;
  role: typeof schema.role.$inferSelect;
  rolePermission: typeof schema.rolePermission.$inferSelect;
  sale: typeof schema.sale.$inferSelect;
  saleItem: typeof schema.saleItem.$inferSelect;
  salesReturn: typeof schema.salesReturn.$inferSelect;
  salesReturnItem: typeof schema.salesReturnItem.$inferSelect;
  salesReturnReplacementItem: typeof schema.salesReturnReplacementItem.$inferSelect;
  session: typeof schema.session.$inferSelect;
  setting: typeof schema.setting.$inferSelect;
  stockCount: typeof schema.stockCount.$inferSelect;
  stockCountItem: typeof schema.stockCountItem.$inferSelect;
  stockMovement: typeof schema.stockMovement.$inferSelect;
  supplier: typeof schema.supplier.$inferSelect;
  supplierLedger: typeof schema.supplierLedger.$inferSelect;
  unit: typeof schema.unit.$inferSelect;
  user: typeof schema.user.$inferSelect;
};

type ModelInserts = {
  [K in ModelName]: K extends keyof ModelRows ? Partial<ModelRows[K]> : QueryArgs;
};

type ModelRelations = {
  account: { parent: "account"; accounts: "account"; children: "account"; journalLines: "journalLine"; bankAccounts: "bankAccount" };
  auditLog: { user: "user" };
  backgroundJob: {};
  backupRecord: {};
  bankAccount: { glAccount: "account" };
  brand: { products: "product" };
  cashbookEntry: { createdBy: "user"; payment: "payment"; salesReturn: "salesReturn"; expense: "expense"; reversalOf: "cashbookEntry"; reversalEntry: "cashbookEntry" };
  category: { products: "product" };
  customer: { ledgers: "customerLedger"; ledgerEntries: "customerLedger"; customerLedgers: "customerLedger"; payments: "payment"; sales: "sale"; salesReturns: "salesReturn" };
  customerLedger: { customer: "customer"; sale: "sale"; payment: "payment"; salesReturn: "salesReturn"; createdBy: "user"; reversalOfEntry: "customerLedger"; reversalEntry: "customerLedger" };
  dailyClosing: { closedBy: "user" };
  damageEntry: { product: "product"; batch: "productBatch"; createdBy: "user" };
  discountApproval: { requestedBy: "user"; approvedBy: "user" };
  expense: { createdBy: "user"; bankAccount: "bankAccount"; expenseCategory: "expenseCategory" };
  expenseCategory: { account: "account"; expenses: "expense" };
  financialPeriod: {};
  financialTransaction: { fromBankAccount: "bankAccount"; toBankAccount: "bankAccount"; createdBy: "user" };
  heldSale: { createdBy: "user" };
  journalEntry: { lines: "journalLine"; period: "financialPeriod"; createdBy: "user"; reversalOf: "journalEntry"; reversalEntry: "journalEntry" };
  journalLine: { journal: "journalEntry"; account: "account"; customer: "customer"; supplier: "supplier"; product: "product" };
  loginHistory: { user: "user" };
  payment: { customer: "customer"; supplier: "supplier"; sale: "sale"; purchase: "purchase"; createdBy: "user"; cashbookEntries: "cashbookEntry"; customerLedger: "customerLedger"; supplierLedger: "supplierLedger"; reversalPayment: "payment" };
  permission: {};
  product: { category: "category"; brand: "brand"; baseUnit: "unit"; packings: "productPacking"; batches: "productBatch"; stockMovements: "stockMovement" };
  productBatch: { product: "product" };
  productPacking: { product: "product"; unit: "unit" };
  purchase: { supplier: "supplier"; createdBy: "user"; items: "purchaseItem"; payments: "payment"; returns: "purchaseReturn"; supplierLedger: "supplierLedger" };
  purchaseItem: { purchase: "purchase"; product: "product"; batch: "productBatch"; returns: "purchaseReturnItem" };
  purchaseReturn: { purchase: "purchase"; supplier: "supplier"; createdBy: "user"; items: "purchaseReturnItem" };
  purchaseReturnItem: { purchaseReturn: "purchaseReturn"; purchaseItem: "purchaseItem"; product: "product"; batch: "productBatch" };
  role: { users: "user"; permissions: "rolePermission" };
  rolePermission: { role: "role"; permission: "permission" };
  sale: { customer: "customer"; createdBy: "user"; items: "saleItem"; payments: "payment"; returns: "salesReturn"; customerLedger: "customerLedger" };
  saleItem: { sale: "sale"; product: "product"; batch: "productBatch"; returns: "salesReturnItem" };
  salesReturn: { sale: "sale"; customer: "customer"; createdBy: "user"; items: "salesReturnItem"; replacementItems: "salesReturnReplacementItem"; customerLedger: "customerLedger"; cashbookEntries: "cashbookEntry" };
  salesReturnItem: { salesReturn: "salesReturn"; saleItem: "saleItem"; product: "product"; batch: "productBatch" };
  salesReturnReplacementItem: { salesReturn: "salesReturn"; product: "product"; batch: "productBatch" };
  session: { user: "user" };
  setting: {};
  stockCount: { createdBy: "user"; items: "stockCountItem" };
  stockCountItem: { stockCount: "stockCount"; product: "product"; batch: "productBatch" };
  stockMovement: { product: "product"; batch: "productBatch"; createdBy: "user" };
  supplier: { ledgers: "supplierLedger"; ledgerEntries: "supplierLedger"; supplierLedgers: "supplierLedger"; payments: "payment"; purchases: "purchase" };
  supplierLedger: { supplier: "supplier"; purchase: "purchase"; payment: "payment"; createdBy: "user"; reversalOfEntry: "supplierLedger"; reversalEntry: "supplierLedger" };
  unit: { products: "product"; packings: "productPacking" };
  user: { role: "role"; sessions: "session"; cashbookEntries: "cashbookEntry"; stockMovements: "stockMovement" };
};

type ManyRelations = {
  account: "accounts" | "children" | "journalLines" | "bankAccounts";
  auditLog: never;
  backgroundJob: never;
  backupRecord: never;
  bankAccount: never;
  brand: "products";
  cashbookEntry: never;
  category: "products";
  customer: "ledgers" | "ledgerEntries" | "customerLedgers" | "payments" | "sales" | "salesReturns";
  customerLedger: never;
  dailyClosing: never;
  damageEntry: never;
  discountApproval: never;
  expense: never;
  expenseCategory: "expenses";
  financialPeriod: never;
  financialTransaction: never;
  heldSale: never;
  journalEntry: "lines";
  journalLine: never;
  loginHistory: never;
  payment: "cashbookEntries" | "customerLedger" | "supplierLedger";
  permission: never;
  product: "packings" | "batches" | "stockMovements";
  productBatch: never;
  productPacking: never;
  purchase: "items" | "payments" | "returns" | "supplierLedger";
  purchaseItem: "returns";
  purchaseReturn: "items";
  purchaseReturnItem: never;
  role: "users" | "permissions";
  rolePermission: never;
  sale: "items" | "payments" | "returns" | "customerLedger";
  saleItem: "returns";
  salesReturn: "items" | "replacementItems" | "customerLedger" | "cashbookEntries";
  salesReturnItem: never;
  salesReturnReplacementItem: never;
  session: never;
  setting: never;
  stockCount: "items";
  stockCountItem: never;
  stockMovement: never;
  supplier: "ledgers" | "ledgerEntries" | "supplierLedgers" | "payments" | "purchases";
  supplierLedger: never;
  unit: "products" | "packings";
  user: "sessions" | "cashbookEntries" | "stockMovements";
};

type RelationRow<M extends ModelName, K extends keyof ModelRelations[M], Args> =
  ModelRelations[M][K] extends ModelName
    ? K extends ManyRelations[M]
      ? Array<RowResult<ModelRelations[M][K], Args>>
      : RowResult<ModelRelations[M][K], Args>
    : never;

type TrueKeys<T> = {
  [K in keyof T]: T[K] extends boolean ? K : never;
}[keyof T];
type SelectedScalars<M extends ModelName, Select> =
  Select extends QueryArgs ? Pick<ModelRows[M], Extract<TrueKeys<Select>, keyof ModelRows[M]>> : ModelRows[M];
type RelationSelection<M extends ModelName, Shape> =
  Shape extends QueryArgs
    ? { [K in Extract<keyof Shape, keyof ModelRelations[M]>]: Shape[K] extends true ? RelationRow<M, K, undefined> : RelationRow<M, K, Shape[K]> }
    : {};
type RowResult<M extends ModelName, Args> =
  Args extends { select: infer Select }
    ? SelectedScalars<M, Select> & RelationSelection<M, Select>
    : ModelRows[M] & (Args extends { include: infer Include } ? RelationSelection<M, Include> : {});
type FindArgs<M extends ModelName> = QueryArgs & {
  where?: QueryArgs;
  select?: Partial<Record<keyof ModelRows[M] | keyof ModelRelations[M], boolean | QueryArgs>>;
  include?: Partial<Record<keyof ModelRelations[M], boolean | QueryArgs>>;
  orderBy?: QueryArgs | QueryArgs[];
  take?: number;
  skip?: number;
};
type AggregateResult<Args> = Args extends { _sum: infer Sum }
  ? { _sum: { [K in keyof Sum]: number | null } }
  : { _sum: Record<string, number | null> };
type GroupResult<M extends ModelName, Args> =
  (Args extends { by: readonly (infer Key)[] } ? Pick<ModelRows[M], Extract<Key, keyof ModelRows[M]>> : Partial<ModelRows[M]>) &
  (Args extends { _sum: infer Sum } ? { _sum: { [K in keyof Sum]: number | null } } : {}) &
  (Args extends { _max: infer Max } ? { _max: { [K in keyof Max]: K extends keyof ModelRows[M] ? ModelRows[M][K] | null : unknown } } : {});
type IncrementValue = { increment: number };
type WriteData<M extends ModelName> = QueryArgs & {
  [K in keyof ModelRows[M]]?: ModelRows[M][K] | IncrementValue;
};
type WriteArgs<M extends ModelName> = FindArgs<M> & { data?: WriteData<M> };
type AwaitedTuple<T extends readonly unknown[]> = { [K in keyof T]: Awaited<T[K]> };
type ModelDelegate<M extends ModelName> = {
  findMany<const Args extends FindArgs<M> | undefined = undefined>(args?: Args): Promise<Array<RowResult<M, NonNullable<Args>>>>;
  findFirst<const Args extends FindArgs<M> | undefined = undefined>(args?: Args): Promise<RowResult<M, NonNullable<Args>> | null>;
  findUnique<const Args extends FindArgs<M>>(args: Args): Promise<RowResult<M, Args> | null>;
  findFirstOrThrow<const Args extends FindArgs<M> | undefined = undefined>(args?: Args): Promise<RowResult<M, NonNullable<Args>>>;
  findUniqueOrThrow<const Args extends FindArgs<M>>(args: Args): Promise<RowResult<M, Args>>;
  count(args?: FindArgs<M>): Promise<number>;
  aggregate<const Args extends FindArgs<M>>(args?: Args): Promise<AggregateResult<NonNullable<Args>>>;
  groupBy<const Args extends FindArgs<M>>(args?: Args): Promise<Array<GroupResult<M, NonNullable<Args>>>>;
  create<const Args extends WriteArgs<M>>(args: Args): Promise<RowResult<M, Args>>;
  update<const Args extends WriteArgs<M>>(args: Args): Promise<RowResult<M, Args>>;
  updateMany(args: WriteArgs<M>): Promise<{ count: number }>;
  delete<const Args extends FindArgs<M>>(args: Args): Promise<RowResult<M, Args> | null>;
  deleteMany(args?: FindArgs<M>): Promise<{ count: number }>;
  upsert<const Args extends WriteArgs<M> & { create?: ModelInserts[M] & QueryArgs; update?: ModelInserts[M] & QueryArgs }>(args: Args): Promise<RowResult<M, Args>>;
};

const modelTables = {
  account: "Account",
  auditLog: "AuditLog",
  backgroundJob: "BackgroundJob",
  backupRecord: "BackupRecord",
  bankAccount: "BankAccount",
  brand: "Brand",
  cashbookEntry: "CashbookEntry",
  category: "Category",
  customer: "Customer",
  customerLedger: "CustomerLedger",
  dailyClosing: "DailyClosing",
  damageEntry: "DamageEntry",
  discountApproval: "DiscountApproval",
  expense: "Expense",
  expenseCategory: "ExpenseCategory",
  financialPeriod: "FinancialPeriod",
  financialTransaction: "FinancialTransaction",
  heldSale: "HeldSale",
  journalEntry: "JournalEntry",
  journalLine: "JournalLine",
  loginHistory: "LoginHistory",
  payment: "Payment",
  permission: "Permission",
  product: "Product",
  productBatch: "ProductBatch",
  productPacking: "ProductPacking",
  purchase: "Purchase",
  purchaseItem: "PurchaseItem",
  purchaseReturn: "PurchaseReturn",
  purchaseReturnItem: "PurchaseReturnItem",
  role: "Role",
  rolePermission: "RolePermission",
  sale: "Sale",
  saleItem: "SaleItem",
  salesReturn: "SalesReturn",
  salesReturnItem: "SalesReturnItem",
  salesReturnReplacementItem: "SalesReturnReplacementItem",
  session: "Session",
  setting: "Setting",
  stockCount: "StockCount",
  stockCountItem: "StockCountItem",
  stockMovement: "StockMovement",
  supplier: "Supplier",
  supplierLedger: "SupplierLedger",
  unit: "Unit",
  user: "User",
} as const;

const relations: Record<ModelName, Record<string, Relation>> = {
  account: {
    parent: { model: "account", localKey: "parentId", foreignKey: "id" },
    accounts: { model: "account", localKey: "id", foreignKey: "parentId", many: true },
    children: { model: "account", localKey: "id", foreignKey: "parentId", many: true },
    journalLines: { model: "journalLine", localKey: "id", foreignKey: "accountId", many: true },
    bankAccounts: { model: "bankAccount", localKey: "id", foreignKey: "glAccountId", many: true },
  },
  auditLog: { user: { model: "user", localKey: "userId", foreignKey: "id" } },
  backgroundJob: {},
  backupRecord: {},
  bankAccount: { glAccount: { model: "account", localKey: "glAccountId", foreignKey: "id" } },
  brand: { products: { model: "product", localKey: "id", foreignKey: "brandId", many: true } },
  cashbookEntry: {
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    payment: { model: "payment", localKey: "paymentId", foreignKey: "id" },
    salesReturn: { model: "salesReturn", localKey: "salesReturnId", foreignKey: "id" },
    expense: { model: "expense", localKey: "expenseId", foreignKey: "id" },
    reversalOf: { model: "cashbookEntry", localKey: "reversalOfId", foreignKey: "id" },
    reversalEntry: { model: "cashbookEntry", localKey: "id", foreignKey: "reversalOfId" },
  },
  category: { products: { model: "product", localKey: "id", foreignKey: "categoryId", many: true } },
  customer: {
    ledgers: { model: "customerLedger", localKey: "id", foreignKey: "customerId", many: true },
    ledgerEntries: { model: "customerLedger", localKey: "id", foreignKey: "customerId", many: true },
    customerLedgers: { model: "customerLedger", localKey: "id", foreignKey: "customerId", many: true },
    payments: { model: "payment", localKey: "id", foreignKey: "customerId", many: true },
    sales: { model: "sale", localKey: "id", foreignKey: "customerId", many: true },
    salesReturns: { model: "salesReturn", localKey: "id", foreignKey: "customerId", many: true },
  },
  customerLedger: {
    customer: { model: "customer", localKey: "customerId", foreignKey: "id" },
    sale: { model: "sale", localKey: "saleId", foreignKey: "id" },
    payment: { model: "payment", localKey: "paymentId", foreignKey: "id" },
    salesReturn: { model: "salesReturn", localKey: "salesReturnId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    reversalOfEntry: { model: "customerLedger", localKey: "reversalOfEntryId", foreignKey: "id" },
    reversalEntry: { model: "customerLedger", localKey: "id", foreignKey: "reversalOfEntryId" },
  },
  dailyClosing: { closedBy: { model: "user", localKey: "closedById", foreignKey: "id" } },
  damageEntry: {
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
  },
  discountApproval: {
    requestedBy: { model: "user", localKey: "requestedById", foreignKey: "id" },
    approvedBy: { model: "user", localKey: "approvedById", foreignKey: "id" },
  },
  expense: {
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    bankAccount: { model: "bankAccount", localKey: "bankAccountId", foreignKey: "id" },
    expenseCategory: { model: "expenseCategory", localKey: "categoryId", foreignKey: "id" },
  },
  expenseCategory: {
    account: { model: "account", localKey: "accountId", foreignKey: "id" },
    expenses: { model: "expense", localKey: "id", foreignKey: "categoryId", many: true },
  },
  financialPeriod: {},
  financialTransaction: {
    fromBankAccount: { model: "bankAccount", localKey: "fromBankAccountId", foreignKey: "id" },
    toBankAccount: { model: "bankAccount", localKey: "toBankAccountId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
  },
  heldSale: { createdBy: { model: "user", localKey: "createdById", foreignKey: "id" } },
  journalEntry: {
    lines: { model: "journalLine", localKey: "id", foreignKey: "journalId", many: true },
    period: { model: "financialPeriod", localKey: "periodId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    reversalOf: { model: "journalEntry", localKey: "reversalOfId", foreignKey: "id" },
    reversalEntry: { model: "journalEntry", localKey: "id", foreignKey: "reversalOfId" },
  },
  journalLine: {
    journal: { model: "journalEntry", localKey: "journalId", foreignKey: "id" },
    account: { model: "account", localKey: "accountId", foreignKey: "id" },
    customer: { model: "customer", localKey: "customerId", foreignKey: "id" },
    supplier: { model: "supplier", localKey: "supplierId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
  },
  loginHistory: { user: { model: "user", localKey: "userId", foreignKey: "id" } },
  payment: {
    customer: { model: "customer", localKey: "customerId", foreignKey: "id" },
    supplier: { model: "supplier", localKey: "supplierId", foreignKey: "id" },
    sale: { model: "sale", localKey: "saleId", foreignKey: "id" },
    purchase: { model: "purchase", localKey: "purchaseId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    cashbookEntries: { model: "cashbookEntry", localKey: "id", foreignKey: "paymentId", many: true },
    customerLedger: { model: "customerLedger", localKey: "id", foreignKey: "paymentId", many: true },
    supplierLedger: { model: "supplierLedger", localKey: "id", foreignKey: "paymentId", many: true },
    reversalPayment: { model: "payment", localKey: "id", foreignKey: "reversalOfId" },
  },
  permission: {},
  product: {
    category: { model: "category", localKey: "categoryId", foreignKey: "id" },
    brand: { model: "brand", localKey: "brandId", foreignKey: "id" },
    baseUnit: { model: "unit", localKey: "baseUnitId", foreignKey: "id" },
    packings: { model: "productPacking", localKey: "id", foreignKey: "productId", many: true },
    batches: { model: "productBatch", localKey: "id", foreignKey: "productId", many: true },
    stockMovements: { model: "stockMovement", localKey: "id", foreignKey: "productId", many: true },
  },
  productBatch: { product: { model: "product", localKey: "productId", foreignKey: "id" } },
  productPacking: { product: { model: "product", localKey: "productId", foreignKey: "id" }, unit: { model: "unit", localKey: "unitId", foreignKey: "id" } },
  purchase: {
    supplier: { model: "supplier", localKey: "supplierId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    items: { model: "purchaseItem", localKey: "id", foreignKey: "purchaseId", many: true },
    payments: { model: "payment", localKey: "id", foreignKey: "purchaseId", many: true },
    returns: { model: "purchaseReturn", localKey: "id", foreignKey: "purchaseId", many: true },
    supplierLedger: { model: "supplierLedger", localKey: "id", foreignKey: "purchaseId", many: true },
  },
  purchaseItem: {
    purchase: { model: "purchase", localKey: "purchaseId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
    returns: { model: "purchaseReturnItem", localKey: "id", foreignKey: "purchaseItemId", many: true },
  },
  purchaseReturn: {
    purchase: { model: "purchase", localKey: "purchaseId", foreignKey: "id" },
    supplier: { model: "supplier", localKey: "supplierId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    items: { model: "purchaseReturnItem", localKey: "id", foreignKey: "purchaseReturnId", many: true },
  },
  purchaseReturnItem: {
    purchaseReturn: { model: "purchaseReturn", localKey: "purchaseReturnId", foreignKey: "id" },
    purchaseItem: { model: "purchaseItem", localKey: "purchaseItemId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
  },
  role: {
    users: { model: "user", localKey: "id", foreignKey: "roleId", many: true },
    permissions: { model: "rolePermission", localKey: "id", foreignKey: "roleId", many: true },
  },
  rolePermission: {
    role: { model: "role", localKey: "roleId", foreignKey: "id" },
    permission: { model: "permission", localKey: "permissionId", foreignKey: "id" },
  },
  sale: {
    customer: { model: "customer", localKey: "customerId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    items: { model: "saleItem", localKey: "id", foreignKey: "saleId", many: true },
    payments: { model: "payment", localKey: "id", foreignKey: "saleId", many: true },
    returns: { model: "salesReturn", localKey: "id", foreignKey: "saleId", many: true },
    customerLedger: { model: "customerLedger", localKey: "id", foreignKey: "saleId", many: true },
  },
  saleItem: {
    sale: { model: "sale", localKey: "saleId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
    returns: { model: "salesReturnItem", localKey: "id", foreignKey: "saleItemId", many: true },
  },
  salesReturn: {
    sale: { model: "sale", localKey: "saleId", foreignKey: "id" },
    customer: { model: "customer", localKey: "customerId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    items: { model: "salesReturnItem", localKey: "id", foreignKey: "salesReturnId", many: true },
    replacementItems: { model: "salesReturnReplacementItem", localKey: "id", foreignKey: "salesReturnId", many: true },
    customerLedger: { model: "customerLedger", localKey: "id", foreignKey: "salesReturnId", many: true },
    cashbookEntries: { model: "cashbookEntry", localKey: "id", foreignKey: "salesReturnId", many: true },
  },
  salesReturnItem: {
    salesReturn: { model: "salesReturn", localKey: "salesReturnId", foreignKey: "id" },
    saleItem: { model: "saleItem", localKey: "saleItemId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
  },
  salesReturnReplacementItem: {
    salesReturn: { model: "salesReturn", localKey: "salesReturnId", foreignKey: "id" },
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
  },
  session: { user: { model: "user", localKey: "userId", foreignKey: "id" } },
  setting: {},
  stockCount: { createdBy: { model: "user", localKey: "createdById", foreignKey: "id" }, items: { model: "stockCountItem", localKey: "id", foreignKey: "stockCountId", many: true } },
  stockCountItem: { stockCount: { model: "stockCount", localKey: "stockCountId", foreignKey: "id" }, product: { model: "product", localKey: "productId", foreignKey: "id" }, batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" } },
  stockMovement: {
    product: { model: "product", localKey: "productId", foreignKey: "id" },
    batch: { model: "productBatch", localKey: "batchId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
  },
  supplier: {
    ledgers: { model: "supplierLedger", localKey: "id", foreignKey: "supplierId", many: true },
    ledgerEntries: { model: "supplierLedger", localKey: "id", foreignKey: "supplierId", many: true },
    supplierLedgers: { model: "supplierLedger", localKey: "id", foreignKey: "supplierId", many: true },
    payments: { model: "payment", localKey: "id", foreignKey: "supplierId", many: true },
    purchases: { model: "purchase", localKey: "id", foreignKey: "supplierId", many: true },
  },
  supplierLedger: {
    supplier: { model: "supplier", localKey: "supplierId", foreignKey: "id" },
    purchase: { model: "purchase", localKey: "purchaseId", foreignKey: "id" },
    payment: { model: "payment", localKey: "paymentId", foreignKey: "id" },
    createdBy: { model: "user", localKey: "createdById", foreignKey: "id" },
    reversalOfEntry: { model: "supplierLedger", localKey: "reversalOfEntryId", foreignKey: "id" },
    reversalEntry: { model: "supplierLedger", localKey: "id", foreignKey: "reversalOfEntryId" },
  },
  unit: { products: { model: "product", localKey: "id", foreignKey: "baseUnitId", many: true }, packings: { model: "productPacking", localKey: "id", foreignKey: "unitId", many: true } },
  user: {
    role: { model: "role", localKey: "roleId", foreignKey: "id" },
    sessions: { model: "session", localKey: "id", foreignKey: "userId", many: true },
    cashbookEntries: { model: "cashbookEntry", localKey: "id", foreignKey: "createdById", many: true },
    stockMovements: { model: "stockMovement", localKey: "id", foreignKey: "createdById", many: true },
  },
};

const nestedCreates: Record<string, { model: ModelName; foreignKey: string }> = {
  "journalEntry.lines": { model: "journalLine", foreignKey: "journalId" },
  "product.packings": { model: "productPacking", foreignKey: "productId" },
};

const databasePath = resolveDatabasePath();
mkdirSync(path.dirname(databasePath), { recursive: true });
process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;

const sqlite = new Database(databasePath);
configureSqlite(sqlite);

export const orm = drizzle(sqlite, { schema });
export const db: AppDbClient = createAppDb(sqlite);
export const prisma = db;

export type TransactionClient = {
  [K in ModelName]: ModelDelegate<K>;
} & {
  $executeRawUnsafe: (query: string, ...params: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: <T = unknown[]>(
    query: string,
    ...params: unknown[]
  ) => Promise<T>;
};
export type AppDbClient = TransactionClient & {
  $disconnect(): Promise<void>;
  $transaction<T>(
    work: (tx: TransactionClient) => T | Promise<T>,
  ): Promise<Awaited<T>>;
  $transaction<T extends readonly unknown[]>(work: T): Promise<AwaitedTuple<T>>;
};
export type DbClient = AppDbClient;
export type PaymentMethod = string;
export type SourceType = string;
export type StockMovementType = string;
export type BackupKind = string;
export type JobType = string;
export type JobStatus = string;
export type CashDirection = string;
export type CashbookEntryType = string;
export type ReturnCondition = string;

export function closeDb() {
  sqlite.close();
}

export function migrateDatabase(targetDatabasePath = databasePath, migrationsFolder = resolveMigrationsFolder()) {
  return runMigrations(targetDatabasePath, migrationsFolder);
}

function createAppDb(connection: Database.Database): AppDbClient {
  const client = {
    $disconnect: async () => undefined,
    $executeRawUnsafe: async (query: string, ...params: unknown[]) => connection.prepare(query).run(...params),
    $queryRawUnsafe: async (query: string, ...params: unknown[]) => connection.prepare(query).all(...params).map(normalizeRow),
    $transaction: async (work: unknown) => {
      if (Array.isArray(work)) return Promise.all(work);
      if (typeof work !== "function") throw new Error("Unsupported transaction call.");
      connection.prepare("BEGIN IMMEDIATE").run();
      try {
        const result = await (work as (tx: typeof client) => unknown)(client);
        connection.prepare("COMMIT").run();
        return result;
      } catch (error) {
        connection.prepare("ROLLBACK").run();
        throw error;
      }
    },
  } as unknown as AppDbClient;
  for (const model of Object.keys(modelTables) as ModelName[]) assignDelegate(client, connection, model);
  return client;
}

function assignDelegate<M extends ModelName>(client: AppDbClient, connection: Database.Database, model: M) {
  (client as { [K in M]: ModelDelegate<M> })[model] = delegate(connection, model);
}

function delegate<M extends ModelName>(connection: Database.Database, model: M): ModelDelegate<M> {
  return {
    findMany: async (args: QueryArgs = {}) => selectRows(connection, model, args),
    findFirst: async (args: QueryArgs = {}) => (await selectRows(connection, model, { ...args, take: 1 }))[0] ?? null,
    findUnique: async (args: QueryArgs) => (await selectRows(connection, model, { ...args, take: 1 }))[0] ?? null,
    findFirstOrThrow: async (args: QueryArgs = {}) => requireRow((await selectRows(connection, model, { ...args, take: 1 }))[0], model),
    findUniqueOrThrow: async (args: QueryArgs) => requireRow((await selectRows(connection, model, { ...args, take: 1 }))[0], model),
    count: async (args: QueryArgs = {}) => countRows(connection, model, asOptionalQueryArgs(args.where)),
    aggregate: async (args: QueryArgs = {}) => aggregateRows(connection, model, args),
    groupBy: async (args: QueryArgs = {}) => groupRows(connection, model, args),
    create: async (args: QueryArgs) => createRow(connection, model, args),
    update: async (args: QueryArgs) => updateRow(connection, model, args),
    updateMany: async (args: QueryArgs) => updateManyRows(connection, model, args),
    delete: async (args: QueryArgs) => deleteRows(connection, model, args, false),
    deleteMany: async (args: QueryArgs = {}) => deleteRows(connection, model, args, true),
    upsert: async (args: QueryArgs) => {
      const existing = await selectRows(connection, model, { where: args.where, take: 1 });
      if (existing[0]) return updateRow(connection, model, { where: args.where, data: args.update, select: args.select, include: args.include });
      return createRow(connection, model, { data: args.create, select: args.select, include: args.include });
    },
  } as ModelDelegate<M>;
}

async function selectRows(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const table = modelTables[model];
  const params: unknown[] = [];
  const where = whereSql(model, asOptionalQueryArgs(args.where), params);
  const order = orderSql(asOrderBy(args.orderBy));
  const limit = args.take === undefined ? "" : ` LIMIT ${Number(args.take)}`;
  const offset = args.skip === undefined ? "" : ` OFFSET ${Number(args.skip)}`;
  const rows = connection.prepare(`SELECT * FROM ${q(table)}${where}${order}${limit}${offset}`).all(...params).map(normalizeRow);
  return Promise.all(rows.map((row) => shapeRow(connection, model, row, args)));
}

function countRows(connection: Database.Database, model: ModelName, where: QueryArgs | undefined) {
  const params: unknown[] = [];
  const condition = whereSql(model, where, params);
  const row = connection.prepare(`SELECT COUNT(*) AS count FROM ${q(modelTables[model])}${condition}`).get(...params) as { count: number };
  return row.count;
}

function aggregateRows(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const params: unknown[] = [];
  const condition = whereSql(model, asOptionalQueryArgs(args.where), params);
  const sums = Object.keys(asQueryArgs(args._sum));
  if (!sums.length) return { _sum: {} };
  const selected = sums.map((column) => `SUM(${q(column)}) AS ${q(column)}`).join(", ");
  const row = normalizeRow(connection.prepare(`SELECT ${selected} FROM ${q(modelTables[model])}${condition}`).get(...params) ?? {});
  return { _sum: Object.fromEntries(sums.map((column) => [column, row[column] ?? null])) };
}

function groupRows(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const by = Array.isArray(args.by) ? args.by.map(String) : [];
  const sums = Object.keys(asQueryArgs(args._sum));
  const maxes = Object.keys(asQueryArgs(args._max));
  const params: unknown[] = [];
  const condition = whereSql(model, asOptionalQueryArgs(args.where), params);
  const select = [
    ...by.map((column: string) => q(column)),
    ...sums.map((column) => `SUM(${q(column)}) AS ${q(`_sum_${column}`)}`),
    ...maxes.map((column) => `MAX(${q(column)}) AS ${q(`_max_${column}`)}`),
  ].join(", ");
  const rows = connection.prepare(`SELECT ${select} FROM ${q(modelTables[model])}${condition} GROUP BY ${by.map(q).join(", ")}`).all(...params).map(normalizeRow);
  return rows.map((row) => ({
    ...Object.fromEntries(by.map((column: string) => [column, row[column]])),
    ...(sums.length ? { _sum: Object.fromEntries(sums.map((column) => [column, row[`_sum_${column}`] ?? null])) } : {}),
    ...(maxes.length ? { _max: Object.fromEntries(maxes.map((column) => [column, row[`_max_${column}`] ?? null])) } : {}),
  }));
}

async function createRow(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const table = modelTables[model];
  const data = prepareData(model, asQueryArgs(args.data));
  const nested = takeNestedCreates(model, data);
  const columns = Object.keys(data);
  const values = columns.map((column) => toDriver(data[column]));
  connection.prepare(`INSERT INTO ${q(table)} (${columns.map(q).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...values);
  for (const item of nested) {
    const rows = Array.isArray(item.rows) ? item.rows : [item.rows];
    for (const row of rows) await createRow(connection, item.model, { data: { ...row, [item.foreignKey]: data.id } });
  }
  return (await selectRows(connection, model, { where: { id: data.id }, select: args.select, include: args.include }))[0] ?? data;
}

async function updateRow(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const found = (await selectRows(connection, model, { where: asOptionalQueryArgs(args.where), take: 1 }))[0];
  if (!found) throw new Error(`${model} was not found.`);
  await updateManyRows(connection, model, { where: { id: found.id }, data: args.data });
  return (await selectRows(connection, model, { where: { id: found.id }, select: args.select, include: args.include }))[0];
}

async function updateManyRows(connection: Database.Database, model: ModelName, args: QueryArgs) {
  const data = prepareData(model, asQueryArgs(args.data), false);
  const columns = Object.keys(data);
  if (!columns.length) return { count: countRows(connection, model, asOptionalQueryArgs(args.where)) };
  const params: unknown[] = [];
  const assignments = columns.map((column) => assignmentSql(column, data[column], params));
  const where = whereSql(model, asOptionalQueryArgs(args.where), params);
  const result = connection.prepare(`UPDATE ${q(modelTables[model])} SET ${assignments.join(", ")}${where}`).run(...params);
  return { count: result.changes };
}

function assignmentSql(columnName: string, value: unknown, params: unknown[]) {
  if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value) && "increment" in value) {
    params.push(toDriver((value as { increment: unknown }).increment));
    return `${q(columnName)} = ${q(columnName)} + ?`;
  }
  params.push(toDriver(value));
  return `${q(columnName)} = ?`;
}

async function deleteRows(connection: Database.Database, model: ModelName, args: QueryArgs, many: boolean) {
  const rows = await selectRows(connection, model, { where: asOptionalQueryArgs(args.where), take: many ? undefined : 1 });
  const params: unknown[] = [];
  const where = whereSql(model, asOptionalQueryArgs(args.where), params);
  const result = connection.prepare(`DELETE FROM ${q(modelTables[model])}${where}`).run(...params);
  return many ? { count: result.changes } : rows[0] ?? null;
}

function prepareData(model: ModelName, input: QueryArgs, create = true) {
  const data = { ...input };
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue;
    const relationInput = value as { connect?: { id?: unknown }; disconnect?: unknown };
    if ("connect" in value) data[`${key}Id`] = relationInput.connect?.id;
    if ("disconnect" in value) data[`${key}Id`] = null;
  }
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value && typeof value === "object" && ("connect" in value || "disconnect" in value)) delete data[key];
  }
  if (create && !data.id) data.id = randomUUID();
  if (create && hasUpdatedAt(model) && !data.updatedAt) data.updatedAt = new Date();
  if (!create && hasUpdatedAt(model) && data.updatedAt === undefined) data.updatedAt = new Date();
  return data;
}

function takeNestedCreates(model: ModelName, data: QueryArgs) {
  const nested: Array<{ model: ModelName; foreignKey: string; rows: QueryArgs | QueryArgs[] }> = [];
  for (const [key, value] of Object.entries({ ...data })) {
    const config = nestedCreates[`${model}.${key}`];
    if (!config || !value || typeof value !== "object" || !("create" in value)) continue;
    nested.push({ ...config, rows: (value as { create: QueryArgs | QueryArgs[] }).create });
    delete data[key];
  }
  return nested;
}

async function shapeRow(connection: Database.Database, model: ModelName, row: QueryArgs, args: QueryArgs) {
  const selection = args.select ?? args.include;
  const shaped: QueryArgs = args.select ? {} : { ...row };
  if (args.select) {
    for (const [key, value] of Object.entries(args.select)) {
      if (value === true) shaped[key] = row[key];
    }
  }
  if (selection) {
    for (const [key, value] of Object.entries(selection)) {
      if (key === "_count" && value && typeof value === "object") {
        const counts: Record<string, number> = {};
        shaped._count = counts;
        const countSelect = (value as { select?: QueryArgs }).select ?? {};
        for (const relationName of Object.keys(countSelect)) counts[relationName] = await relationCount(connection, model, row, relationName);
      } else if (value && typeof value === "object") {
        const loaded = await loadRelation(connection, model, row, key, value as QueryArgs);
        if (loaded !== undefined) shaped[key] = loaded;
      } else if (args.include && value === true) {
        const loaded = await loadRelation(connection, model, row, key, {});
        if (loaded !== undefined) shaped[key] = loaded;
      }
    }
  }
  return shaped;
}

async function relationCount(connection: Database.Database, model: ModelName, row: QueryArgs, relationName: string) {
  const relation = relations[model][relationName];
  if (!relation) return 0;
  return countRows(connection, relation.model, { [relation.foreignKey]: row[relation.localKey] });
}

async function loadRelation(connection: Database.Database, model: ModelName, row: QueryArgs, relationName: string, args: QueryArgs) {
  const relation = relations[model][relationName];
  if (!relation) return undefined;
  const where = relation.many ? { ...asQueryArgs(args.where), [relation.foreignKey]: row[relation.localKey] } : { [relation.foreignKey]: row[relation.localKey] };
  if (row[relation.localKey] == null) return relation.many ? [] : null;
  const result = await selectRows(connection, relation.model, { ...args, where });
  return relation.many ? result : result[0] ?? null;
}

function whereSql(model: ModelName, where: QueryArgs | undefined, params: unknown[], alias?: string): string {
  if (!where || !Object.keys(where).length) return "";
  const condition = conditionsSql(model, where, params, alias).filter(Boolean).join(" AND ");
  return condition ? ` WHERE ${condition}` : "";
}

function conditionsSql(model: ModelName, where: QueryArgs, params: unknown[], alias?: string): string[] {
  return Object.entries(where).flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (key === "AND") return [`(${(Array.isArray(value) ? value : [value]).map((part) => conditionsSql(model, asQueryArgs(part), params, alias).join(" AND ")).filter(Boolean).join(" AND ")})`];
    if (key === "OR") return [`(${(Array.isArray(value) ? value : [value]).map((part) => conditionsSql(model, asQueryArgs(part), params, alias).join(" AND ")).filter(Boolean).join(" OR ")})`];
    if (key === "NOT") return [`NOT (${conditionsSql(model, asQueryArgs(value), params, alias).join(" AND ")})`];
    const relation = relations[model][key];
    if (relation && value && typeof value === "object") return [relationFilterSql(model, relation, asQueryArgs(value), params, alias)];
    if (!relation && key.includes("_") && value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
      return conditionsSql(model, value as QueryArgs, params, alias);
    }
    return [fieldConditionSql(column(key, alias), value, params)];
  });
}

function relationFilterSql(model: ModelName, relation: Relation, value: QueryArgs, params: unknown[], alias?: string) {
  const parent = q(modelTables[model]);
  const parentRef = `${alias ?? parent}.${q(relation.localKey)}`;
  const childAlias = `${relation.model}_${params.length}`;
  const target = q(modelTables[relation.model]);
  const filter = relation.many ? value.some ?? value : value;
  const nested = conditionsSql(relation.model, asQueryArgs(filter), params, childAlias).join(" AND ");
  const join = `${childAlias}.${q(relation.foreignKey)} = ${parentRef}`;
  return `EXISTS (SELECT 1 FROM ${target} ${childAlias} WHERE ${join}${nested ? ` AND ${nested}` : ""})`;
}

function fieldConditionSql(field: string, value: unknown, params: unknown[]): string {
  if (value === null) return `${field} IS NULL`;
  if (typeof value !== "object" || value instanceof Date || Array.isArray(value)) {
    params.push(toDriver(value));
    return `${field} = ?`;
  }
  const parts: string[] = [];
  for (const [operator, operand] of Object.entries(value as QueryArgs)) {
    if (operand === undefined) continue;
    if (operator === "in") { params.push(...(operand as unknown[]).map(toDriver)); parts.push(`${field} IN (${(operand as unknown[]).map(() => "?").join(", ") || "NULL"})`); }
    else if (operator === "notIn") { params.push(...(operand as unknown[]).map(toDriver)); parts.push(`${field} NOT IN (${(operand as unknown[]).map(() => "?").join(", ") || "NULL"})`); }
    else if (operator === "not") parts.push(operand === null ? `${field} IS NOT NULL` : `NOT (${fieldConditionSql(field, operand, params)})`);
    else if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") { params.push(toDriver(operand)); parts.push(`${field} ${op(operator)} ?`); }
    else if (operator === "contains") { params.push(`%${operand}%`); parts.push(`${field} LIKE ?`); }
    else if (operator === "startsWith") { params.push(`${operand}%`); parts.push(`${field} LIKE ?`); }
    else if (operator === "endsWith") { params.push(`%${operand}`); parts.push(`${field} LIKE ?`); }
  }
  return parts.length ? parts.join(" AND ") : "1 = 1";
}

function orderSql(orderBy: QueryArgs | QueryArgs[] | undefined) {
  if (!orderBy) return "";
  const items = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((order) => Object.entries(order).flatMap(([key, direction]) => {
    if (direction && typeof direction === "object") return [];
    return [`${q(key)} ${String(direction).toUpperCase() === "DESC" ? "DESC" : "ASC"}`];
  }));
  return items.length ? ` ORDER BY ${items.join(", ")}` : "";
}

function asQueryArgs(value: unknown): QueryArgs {
  return value && typeof value === "object" && !Array.isArray(value) ? value as QueryArgs : {};
}

function asOptionalQueryArgs(value: unknown): QueryArgs | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as QueryArgs : undefined;
}

function asOrderBy(value: unknown): QueryArgs | QueryArgs[] | undefined {
  if (Array.isArray(value)) return value.map(asQueryArgs);
  return asOptionalQueryArgs(value);
}

function normalizeRow(row: unknown): QueryArgs {
  if (!row || typeof row !== "object") return {};
  const copy: QueryArgs = {};
  for (const [key, value] of Object.entries(row)) copy[key] = fromDriver(key, value);
  return copy;
}

function fromDriver(key: string, value: unknown) {
  if (value == null) return value;
  if (/At$|Date$|Until$|On$/.test(key)) return coerceSqliteDate(value);
  if (typeof value === "number" && booleanColumns.has(key)) return Boolean(value);
  return value;
}

export function coerceSqliteDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value !== "string") return new Date(0);
  const normalized = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(value)
    ? `${value.includes(" ") ? value.replace(" ", "T") : `${value}T12:00:00`}.000Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function toDriver(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function requireRow<T>(row: T | undefined | null, model: ModelName): T {
  if (!row) throw new Error(`${model} was not found.`);
  return row;
}

const booleanColumns = new Set(["allowManual", "isActive", "isSystem", "isSecret", "trackBatch", "trackExpiry", "isPurchaseUnit", "isSaleUnit", "success"]);
const updatedAtModels = new Set<ModelName>(["account", "backgroundJob", "bankAccount", "brand", "category", "customer", "expenseCategory", "financialPeriod", "heldSale", "product", "productBatch", "purchase", "role", "sale", "setting", "supplier", "unit", "user"]);

function hasUpdatedAt(model: ModelName) {
  return updatedAtModels.has(model);
}

function column(name: string, alias?: string) {
  return `${alias ? `${alias}.` : ""}${q(name)}`;
}

function q(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

function op(operator: string) {
  return ({ gt: ">", gte: ">=", lt: "<", lte: "<=" } as Record<string, string>)[operator];
}

export { resolveDatabasePath };
