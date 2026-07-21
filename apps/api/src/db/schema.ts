import { relations, sql } from "drizzle-orm";
import { customType, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const datetimeColumn = customType<{ data: Date; driverData: unknown }>({
  dataType: () => "datetime",
  fromDriver: (value) => {
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    const normalized = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(String(value))
      ? `${String(value).includes(" ") ? String(value).replace(" ", "T") : `${value}T12:00:00`}.000Z`
      : String(value);
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  },
  toDriver: (value) => value.toISOString(),
});

const booleanColumn = customType<{ data: boolean; driverData: number }>({
  dataType: () => "boolean",
  fromDriver: (value) => Boolean(value),
  toDriver: (value) => (value ? 1 : 0),
});

export const account = sqliteTable("Account", {
  id: text("id").notNull().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  normalBalance: text("normalBalance").notNull(),
  systemCode: text("systemCode"),
  parentId: text("parentId").references((): any => account.id, { onDelete: "restrict", onUpdate: "cascade" }),
  allowManual: booleanColumn("allowManual").notNull().default(false),
  isActive: booleanColumn("isActive").notNull().default(true),
  isSystem: booleanColumn("isSystem").notNull().default(false),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Account_parentId_idx").on(table.parentId),
  index("Account_type_isActive_idx").on(table.type, table.isActive),
  uniqueIndex("Account_systemCode_key").on(table.systemCode),
  uniqueIndex("Account_code_key").on(table.code),
]);

export const auditLog = sqliteTable("AuditLog", {
  id: text("id").notNull().primaryKey(),
  userId: text("userId").references(() => user.id, { onDelete: "set null", onUpdate: "cascade" }),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId"),
  beforeJson: text("beforeJson"),
  afterJson: text("afterJson"),
  ipAddress: text("ipAddress"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("AuditLog_userId_createdAt_idx").on(table.userId, table.createdAt),
  index("AuditLog_entityType_entityId_createdAt_idx").on(table.entityType, table.entityId, table.createdAt),
]);

export const backgroundJob = sqliteTable("BackgroundJob", {
  id: text("id").notNull().primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default('PENDING'),
  dedupeKey: text("dedupeKey").notNull(),
  payloadJson: text("payloadJson").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("maxAttempts").notNull().default(12),
  nextRunAt: datetimeColumn("nextRunAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  lockedAt: datetimeColumn("lockedAt"),
  lastError: text("lastError"),
  completedAt: datetimeColumn("completedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("BackgroundJob_type_status_createdAt_idx").on(table.type, table.status, table.createdAt),
  index("BackgroundJob_status_nextRunAt_createdAt_idx").on(table.status, table.nextRunAt, table.createdAt),
  uniqueIndex("BackgroundJob_dedupeKey_key").on(table.dedupeKey),
]);

export const backupRecord = sqliteTable("BackupRecord", {
  id: text("id").notNull().primaryKey(),
  fileName: text("fileName").notNull(),
  localPath: text("localPath").notNull(),
  checksumSha256: text("checksumSha256").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  kind: text("kind").notNull(),
  driveFileId: text("driveFileId"),
  driveUploadedAt: datetimeColumn("driveUploadedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("BackupRecord_driveUploadedAt_createdAt_idx").on(table.driveUploadedAt, table.createdAt),
  index("BackupRecord_createdAt_idx").on(table.createdAt),
  uniqueIndex("BackupRecord_driveFileId_key").on(table.driveFileId),
  uniqueIndex("BackupRecord_fileName_key").on(table.fileName),
]);

export const bankAccount = sqliteTable("BankAccount", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  accountNumber: text("accountNumber"),
  bankName: text("bankName"),
  glAccountId: text("glAccountId").notNull().references((): any => account.id, { onDelete: "restrict", onUpdate: "cascade" }),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("BankAccount_isActive_name_idx").on(table.isActive, table.name),
  uniqueIndex("BankAccount_glAccountId_key").on(table.glAccountId),
]);

export const brand = sqliteTable("Brand", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Brand_name_key").on(table.name),
]);

export const cashbookEntry = sqliteTable("CashbookEntry", {
  id: text("id").notNull().primaryKey(),
  entryNumber: text("entryNumber").notNull(),
  direction: text("direction").notNull(),
  entryType: text("entryType").notNull(),
  amountMinor: integer("amountMinor").notNull(),
  paymentId: text("paymentId").references((): any => payment.id, { onDelete: "set null", onUpdate: "cascade" }),
  salesReturnId: text("salesReturnId").references(() => salesReturn.id, { onDelete: "set null", onUpdate: "cascade" }),
  expenseId: text("expenseId").references(() => expense.id, { onDelete: "set null", onUpdate: "cascade" }),
  sourceType: text("sourceType").notNull(),
  sourceId: text("sourceId").notNull(),
  notes: text("notes"),
  reference: text("reference"),
  reversalOfId: text("reversalOfId").references((): any => cashbookEntry.id, { onDelete: "restrict", onUpdate: "cascade" }),
  occurredAt: datetimeColumn("occurredAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("CashbookEntry_sourceType_sourceId_entryType_key").on(table.sourceType, table.sourceId, table.entryType),
  index("CashbookEntry_entryType_occurredAt_idx").on(table.entryType, table.occurredAt),
  index("CashbookEntry_createdById_occurredAt_idx").on(table.createdById, table.occurredAt),
  index("CashbookEntry_occurredAt_direction_idx").on(table.occurredAt, table.direction),
  uniqueIndex("CashbookEntry_reversalOfId_key").on(table.reversalOfId),
  uniqueIndex("CashbookEntry_entryNumber_key").on(table.entryNumber),
]);

export const category = sqliteTable("Category", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Category_name_key").on(table.name),
]);

export const customer = sqliteTable("Customer", {
  id: text("id").notNull().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  businessName: text("businessName"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  taxIdentifier: text("taxIdentifier"),
  province: text("province"),
  fbrRegistrationType: text("fbrRegistrationType").notNull().default('UNREGISTERED'),
  customerType: text("customerType").notNull().default('RETAILER'),
  creditLimitMinor: integer("creditLimitMinor").notNull().default(0),
  openingBalanceMinor: integer("openingBalanceMinor").notNull().default(0),
  paymentTermsDays: integer("paymentTermsDays").notNull().default(0),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Customer_customerType_isActive_idx").on(table.customerType, table.isActive),
  index("Customer_businessName_idx").on(table.businessName),
  index("Customer_phone_idx").on(table.phone),
  index("Customer_name_idx").on(table.name),
  uniqueIndex("Customer_code_key").on(table.code),
]);

export const customerLedger = sqliteTable("CustomerLedger", {
  id: text("id").notNull().primaryKey(),
  customerId: text("customerId").notNull().references(() => customer.id, { onDelete: "restrict", onUpdate: "cascade" }),
  entryType: text("entryType").notNull(),
  debitMinor: integer("debitMinor").notNull().default(0),
  creditMinor: integer("creditMinor").notNull().default(0),
  sourceType: text("sourceType").notNull(),
  sourceId: text("sourceId").notNull(),
  saleId: text("saleId").references(() => sale.id, { onDelete: "set null", onUpdate: "cascade" }),
  paymentId: text("paymentId").references((): any => payment.id, { onDelete: "set null", onUpdate: "cascade" }),
  salesReturnId: text("salesReturnId").references(() => salesReturn.id, { onDelete: "set null", onUpdate: "cascade" }),
  notes: text("notes"),
  dueDate: datetimeColumn("dueDate"),
  reversalOfEntryId: text("reversalOfEntryId").references((): any => customerLedger.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdById: text("createdById").references(() => user.id, { onDelete: "set null", onUpdate: "cascade" }),
  occurredAt: datetimeColumn("occurredAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("CustomerLedger_sourceType_sourceId_entryType_key").on(table.sourceType, table.sourceId, table.entryType),
  index("CustomerLedger_customerId_occurredAt_idx").on(table.customerId, table.occurredAt),
  uniqueIndex("CustomerLedger_reversalOfEntryId_key").on(table.reversalOfEntryId),
]);

export const dailyClosing = sqliteTable("DailyClosing", {
  id: text("id").notNull().primaryKey(),
  businessDate: datetimeColumn("businessDate").notNull(),
  openingCashMinor: integer("openingCashMinor").notNull(),
  cashInMinor: integer("cashInMinor").notNull(),
  cashOutMinor: integer("cashOutMinor").notNull(),
  expectedCashMinor: integer("expectedCashMinor").notNull(),
  countedCashMinor: integer("countedCashMinor").notNull(),
  differenceMinor: integer("differenceMinor").notNull(),
  notes: text("notes"),
  closedById: text("closedById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  closedAt: datetimeColumn("closedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("DailyClosing_closedById_closedAt_idx").on(table.closedById, table.closedAt),
  uniqueIndex("DailyClosing_businessDate_key").on(table.businessDate),
]);

export const damageEntry = sqliteTable("DamageEntry", {
  id: text("id").notNull().primaryKey(),
  entryNumber: text("entryNumber").notNull(),
  type: text("type").notNull(),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  quantityBase: integer("quantityBase").notNull(),
  costMinor: integer("costMinor").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default('POSTED'),
  occurredAt: datetimeColumn("occurredAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("DamageEntry_batchId_occurredAt_idx").on(table.batchId, table.occurredAt),
  index("DamageEntry_productId_occurredAt_idx").on(table.productId, table.occurredAt),
  uniqueIndex("DamageEntry_entryNumber_key").on(table.entryNumber),
]);

export const discountApproval = sqliteTable("DiscountApproval", {
  id: text("id").notNull().primaryKey(),
  tokenHash: text("tokenHash").notNull(),
  requestedById: text("requestedById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  approvedById: text("approvedById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  discountBps: integer("discountBps").notNull(),
  expiresAt: datetimeColumn("expiresAt").notNull(),
  usedAt: datetimeColumn("usedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("DiscountApproval_requestedById_expiresAt_idx").on(table.requestedById, table.expiresAt),
  uniqueIndex("DiscountApproval_tokenHash_key").on(table.tokenHash),
]);

export const expense = sqliteTable("Expense", {
  id: text("id").notNull().primaryKey(),
  voucherNumber: text("voucherNumber").notNull(),
  category: text("category").notNull(),
  categoryId: text("categoryId").references(() => expenseCategory.id, { onDelete: "restrict", onUpdate: "cascade" }),
  description: text("description").notNull(),
  amountMinor: integer("amountMinor").notNull(),
  method: text("method").notNull(),
  bankAccountId: text("bankAccountId").references(() => bankAccount.id, { onDelete: "set null", onUpdate: "cascade" }),
  reference: text("reference"),
  status: text("status").notNull().default('POSTED'),
  incurredAt: datetimeColumn("incurredAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  voidedAt: datetimeColumn("voidedAt"),
  voidedById: text("voidedById").references(() => user.id, { onDelete: "set null", onUpdate: "cascade" }),
  voidReason: text("voidReason"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Expense_bankAccountId_incurredAt_idx").on(table.bankAccountId, table.incurredAt),
  index("Expense_createdById_incurredAt_idx").on(table.createdById, table.incurredAt),
  index("Expense_categoryId_incurredAt_idx").on(table.categoryId, table.incurredAt),
  index("Expense_incurredAt_status_idx").on(table.incurredAt, table.status),
  uniqueIndex("Expense_voucherNumber_key").on(table.voucherNumber),
]);

export const expenseCategory = sqliteTable("ExpenseCategory", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  accountId: text("accountId").references((): any => account.id, { onDelete: "set null", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ExpenseCategory_isActive_name_idx").on(table.isActive, table.name),
  uniqueIndex("ExpenseCategory_name_key").on(table.name),
]);

export const financialPeriod = sqliteTable("FinancialPeriod", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  startDate: datetimeColumn("startDate").notNull(),
  endDate: datetimeColumn("endDate").notNull(),
  status: text("status").notNull().default('OPEN'),
  closedAt: datetimeColumn("closedAt"),
  closedById: text("closedById"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("FinancialPeriod_startDate_endDate_key").on(table.startDate, table.endDate),
  index("FinancialPeriod_status_startDate_endDate_idx").on(table.status, table.startDate, table.endDate),
  uniqueIndex("FinancialPeriod_name_key").on(table.name),
]);

export const financialTransaction = sqliteTable("FinancialTransaction", {
  id: text("id").notNull().primaryKey(),
  transactionNumber: text("transactionNumber").notNull(),
  type: text("type").notNull(),
  amountMinor: integer("amountMinor").notNull(),
  fromBankAccountId: text("fromBankAccountId").references(() => bankAccount.id, { onDelete: "restrict", onUpdate: "cascade" }),
  toBankAccountId: text("toBankAccountId").references(() => bankAccount.id, { onDelete: "restrict", onUpdate: "cascade" }),
  offsetAccountId: text("offsetAccountId"),
  description: text("description").notNull(),
  reference: text("reference"),
  occurredAt: datetimeColumn("occurredAt").notNull(),
  status: text("status").notNull().default('POSTED'),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("FinancialTransaction_type_occurredAt_idx").on(table.type, table.occurredAt),
  index("FinancialTransaction_occurredAt_status_idx").on(table.occurredAt, table.status),
  uniqueIndex("FinancialTransaction_transactionNumber_key").on(table.transactionNumber),
]);

export const heldSale = sqliteTable("HeldSale", {
  id: text("id").notNull().primaryKey(),
  label: text("label").notNull(),
  cartJson: text("cartJson").notNull(),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("HeldSale_createdById_updatedAt_idx").on(table.createdById, table.updatedAt),
]);

export const journalEntry = sqliteTable("JournalEntry", {
  id: text("id").notNull().primaryKey(),
  entryNumber: text("entryNumber").notNull(),
  sourceType: text("sourceType").notNull(),
  sourceId: text("sourceId").notNull(),
  postingKey: text("postingKey").notNull().default('PRIMARY'),
  transactionDate: datetimeColumn("transactionDate").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default('POSTED'),
  totalDebitMinor: integer("totalDebitMinor").notNull(),
  totalCreditMinor: integer("totalCreditMinor").notNull(),
  periodId: text("periodId").notNull().references(() => financialPeriod.id, { onDelete: "restrict", onUpdate: "cascade" }),
  reversalOfId: text("reversalOfId").references((): any => journalEntry.id, { onDelete: "restrict", onUpdate: "cascade" }),
  reversalReason: text("reversalReason"),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("JournalEntry_sourceType_sourceId_postingKey_key").on(table.sourceType, table.sourceId, table.postingKey),
  index("JournalEntry_periodId_status_idx").on(table.periodId, table.status),
  index("JournalEntry_transactionDate_status_idx").on(table.transactionDate, table.status),
  uniqueIndex("JournalEntry_reversalOfId_key").on(table.reversalOfId),
  uniqueIndex("JournalEntry_entryNumber_key").on(table.entryNumber),
]);

export const journalLine = sqliteTable("JournalLine", {
  id: text("id").notNull().primaryKey(),
  journalId: text("journalId").notNull().references((): any => journalEntry.id, { onDelete: "restrict", onUpdate: "cascade" }),
  lineNumber: integer("lineNumber").notNull(),
  accountId: text("accountId").notNull().references((): any => account.id, { onDelete: "restrict", onUpdate: "cascade" }),
  debitMinor: integer("debitMinor").notNull().default(0),
  creditMinor: integer("creditMinor").notNull().default(0),
  customerId: text("customerId").references(() => customer.id, { onDelete: "restrict", onUpdate: "cascade" }),
  supplierId: text("supplierId").references(() => supplier.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  memo: text("memo"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("JournalLine_journalId_lineNumber_key").on(table.journalId, table.lineNumber),
  index("JournalLine_productId_journalId_idx").on(table.productId, table.journalId),
  index("JournalLine_supplierId_journalId_idx").on(table.supplierId, table.journalId),
  index("JournalLine_customerId_journalId_idx").on(table.customerId, table.journalId),
  index("JournalLine_accountId_journalId_idx").on(table.accountId, table.journalId),
]);

export const loginHistory = sqliteTable("LoginHistory", {
  id: text("id").notNull().primaryKey(),
  userId: text("userId").references(() => user.id, { onDelete: "set null", onUpdate: "cascade" }),
  username: text("username").notNull(),
  success: booleanColumn("success").notNull(),
  reason: text("reason"),
  ipAddress: text("ipAddress"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("LoginHistory_username_createdAt_idx").on(table.username, table.createdAt),
]);

export const payment = sqliteTable("Payment", {
  id: text("id").notNull().primaryKey(),
  receiptNumber: text("receiptNumber").notNull(),
  direction: text("direction").notNull(),
  partyType: text("partyType").notNull(),
  customerId: text("customerId").references(() => customer.id, { onDelete: "set null", onUpdate: "cascade" }),
  supplierId: text("supplierId").references(() => supplier.id, { onDelete: "set null", onUpdate: "cascade" }),
  saleId: text("saleId").references(() => sale.id, { onDelete: "set null", onUpdate: "cascade" }),
  purchaseId: text("purchaseId").references(() => purchase.id, { onDelete: "set null", onUpdate: "cascade" }),
  method: text("method").notNull(),
  bankAccountId: text("bankAccountId").references(() => bankAccount.id, { onDelete: "set null", onUpdate: "cascade" }),
  amountMinor: integer("amountMinor").notNull(),
  status: text("status").notNull().default('POSTED'),
  reversalOfId: text("reversalOfId").references((): any => payment.id, { onDelete: "restrict", onUpdate: "cascade" }),
  reference: text("reference"),
  notes: text("notes"),
  paidAt: datetimeColumn("paidAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Payment_bankAccountId_paidAt_idx").on(table.bankAccountId, table.paidAt),
  index("Payment_purchaseId_idx").on(table.purchaseId),
  index("Payment_saleId_idx").on(table.saleId),
  index("Payment_supplierId_paidAt_idx").on(table.supplierId, table.paidAt),
  index("Payment_customerId_paidAt_idx").on(table.customerId, table.paidAt),
  uniqueIndex("Payment_reversalOfId_key").on(table.reversalOfId),
  uniqueIndex("Payment_receiptNumber_key").on(table.receiptNumber),
]);

export const permission = sqliteTable("Permission", {
  id: text("id").notNull().primaryKey(),
  code: text("code").notNull(),
  description: text("description").notNull(),
}, (table) => [
  uniqueIndex("Permission_code_key").on(table.code),
]);

export const product = sqliteTable("Product", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  categoryId: text("categoryId").references(() => category.id, { onDelete: "set null", onUpdate: "cascade" }),
  brandId: text("brandId").references(() => brand.id, { onDelete: "set null", onUpdate: "cascade" }),
  baseUnitId: text("baseUnitId").notNull().references(() => unit.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productType: text("productType").notNull().default('OIL'),
  sizeValue: real("sizeValue"),
  sizeUnit: text("sizeUnit"),
  purchasePriceMinor: integer("purchasePriceMinor").notNull().default(0),
  averageCostMinor: integer("averageCostMinor").notNull().default(0),
  inventoryValueMinor: integer("inventoryValueMinor").notNull().default(0),
  retailPriceMinor: integer("retailPriceMinor").notNull().default(0),
  wholesalePriceMinor: integer("wholesalePriceMinor").notNull().default(0),
  minimumPriceMinor: integer("minimumPriceMinor").notNull().default(0),
  taxRateBps: integer("taxRateBps").notNull().default(0),
  fbrHsCode: text("fbrHsCode"),
  fbrUom: text("fbrUom").notNull().default('Numbers, pieces, units'),
  fbrSaleType: text("fbrSaleType").notNull().default('Goods at standard rate (default)'),
  fbrFixedNotifiedValueMinor: integer("fbrFixedNotifiedValueMinor").notNull().default(0),
  fbrSroScheduleNo: text("fbrSroScheduleNo"),
  fbrSroItemSerialNo: text("fbrSroItemSerialNo"),
  reorderLevelBaseQty: integer("reorderLevelBaseQty").notNull().default(0),
  stockOnHandBaseQty: integer("stockOnHandBaseQty").notNull().default(0),
  rackLocation: text("rackLocation"),
  notes: text("notes"),
  trackBatch: booleanColumn("trackBatch").notNull().default(true),
  trackExpiry: booleanColumn("trackExpiry").notNull().default(true),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Product_categoryId_brandId_isActive_idx").on(table.categoryId, table.brandId, table.isActive),
  index("Product_name_idx").on(table.name),
  uniqueIndex("Product_barcode_key").on(table.barcode),
  uniqueIndex("Product_sku_key").on(table.sku),
]);

export const productBatch = sqliteTable("ProductBatch", {
  id: text("id").notNull().primaryKey(),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchNumber: text("batchNumber").notNull(),
  manufactureDate: datetimeColumn("manufactureDate"),
  expiryDate: datetimeColumn("expiryDate"),
  purchasePriceMinor: integer("purchasePriceMinor").notNull(),
  stockOnHandBaseQty: integer("stockOnHandBaseQty").notNull().default(0),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("ProductBatch_productId_batchNumber_key").on(table.productId, table.batchNumber),
  index("ProductBatch_expiryDate_stockOnHandBaseQty_idx").on(table.expiryDate, table.stockOnHandBaseQty),
]);

export const productPacking = sqliteTable("ProductPacking", {
  id: text("id").notNull().primaryKey(),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "cascade", onUpdate: "cascade" }),
  unitId: text("unitId").notNull().references(() => unit.id, { onDelete: "restrict", onUpdate: "cascade" }),
  name: text("name").notNull(),
  unitsPerPack: integer("unitsPerPack").notNull(),
  barcode: text("barcode"),
  isPurchaseUnit: booleanColumn("isPurchaseUnit").notNull().default(false),
  isSaleUnit: booleanColumn("isSaleUnit").notNull().default(false),
  isActive: booleanColumn("isActive").notNull().default(true),
}, (table) => [
  uniqueIndex("ProductPacking_productId_name_key").on(table.productId, table.name),
  index("ProductPacking_productId_isActive_idx").on(table.productId, table.isActive),
  uniqueIndex("ProductPacking_barcode_key").on(table.barcode),
]);

export const purchase = sqliteTable("Purchase", {
  id: text("id").notNull().primaryKey(),
  invoiceNumber: text("invoiceNumber").notNull(),
  supplierInvoice: text("supplierInvoice"),
  supplierInvoiceNormalized: text("supplierInvoiceNormalized"),
  supplierId: text("supplierId").notNull().references(() => supplier.id, { onDelete: "restrict", onUpdate: "cascade" }),
  status: text("status").notNull().default('POSTED'),
  paymentStatus: text("paymentStatus").notNull(),
  subtotalMinor: integer("subtotalMinor").notNull(),
  discountMinor: integer("discountMinor").notNull().default(0),
  taxMinor: integer("taxMinor").notNull().default(0),
  transportMinor: integer("transportMinor").notNull().default(0),
  loadingMinor: integer("loadingMinor").notNull().default(0),
  otherExpenseMinor: integer("otherExpenseMinor").notNull().default(0),
  totalMinor: integer("totalMinor").notNull(),
  paidMinor: integer("paidMinor").notNull().default(0),
  dueDate: datetimeColumn("dueDate"),
  notes: text("notes"),
  purchasedAt: datetimeColumn("purchasedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Purchase_supplierId_supplierInvoice_key").on(table.supplierId, table.supplierInvoice),
  index("Purchase_purchasedAt_status_idx").on(table.purchasedAt, table.status),
  index("Purchase_supplierId_purchasedAt_idx").on(table.supplierId, table.purchasedAt),
  index("Purchase_supplierId_supplierInvoiceNormalized_idx").on(table.supplierId, table.supplierInvoiceNormalized),
  uniqueIndex("Purchase_invoiceNumber_key").on(table.invoiceNumber),
]);

export const purchaseItem = sqliteTable("PurchaseItem", {
  id: text("id").notNull().primaryKey(),
  purchaseId: text("purchaseId").notNull().references(() => purchase.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  packingName: text("packingName").notNull(),
  unitsPerPack: integer("unitsPerPack").notNull(),
  packQuantity: integer("packQuantity").notNull(),
  baseQuantity: integer("baseQuantity").notNull().default(0),
  quantityBase: integer("quantityBase").notNull(),
  purchaseRateMinor: integer("purchaseRateMinor").notNull().default(0),
  unitCostMinor: integer("unitCostMinor").notNull(),
  discountMinor: integer("discountMinor").notNull().default(0),
  taxMinor: integer("taxMinor").notNull().default(0),
  lineTotalMinor: integer("lineTotalMinor").notNull(),
}, (table) => [
  index("PurchaseItem_productId_batchId_idx").on(table.productId, table.batchId),
  index("PurchaseItem_purchaseId_idx").on(table.purchaseId),
]);

export const purchaseReturn = sqliteTable("PurchaseReturn", {
  id: text("id").notNull().primaryKey(),
  returnNumber: text("returnNumber").notNull(),
  purchaseId: text("purchaseId").notNull().references(() => purchase.id, { onDelete: "restrict", onUpdate: "cascade" }),
  supplierId: text("supplierId").notNull().references(() => supplier.id, { onDelete: "restrict", onUpdate: "cascade" }),
  status: text("status").notNull().default('POSTED'),
  method: text("method").notNull(),
  subtotalMinor: integer("subtotalMinor").notNull(),
  taxMinor: integer("taxMinor").notNull().default(0),
  totalMinor: integer("totalMinor").notNull(),
  reason: text("reason").notNull(),
  returnedAt: datetimeColumn("returnedAt").notNull(),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("PurchaseReturn_supplierId_returnedAt_idx").on(table.supplierId, table.returnedAt),
  index("PurchaseReturn_purchaseId_returnedAt_idx").on(table.purchaseId, table.returnedAt),
  uniqueIndex("PurchaseReturn_returnNumber_key").on(table.returnNumber),
]);

export const purchaseReturnItem = sqliteTable("PurchaseReturnItem", {
  id: text("id").notNull().primaryKey(),
  purchaseReturnId: text("purchaseReturnId").notNull().references(() => purchaseReturn.id, { onDelete: "restrict", onUpdate: "cascade" }),
  purchaseItemId: text("purchaseItemId").notNull().references(() => purchaseItem.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "restrict", onUpdate: "cascade" }),
  quantityBase: integer("quantityBase").notNull(),
  unitCostMinor: integer("unitCostMinor").notNull(),
  lineTotalMinor: integer("lineTotalMinor").notNull(),
}, (table) => [
  index("PurchaseReturnItem_productId_batchId_idx").on(table.productId, table.batchId),
  index("PurchaseReturnItem_purchaseItemId_idx").on(table.purchaseItemId),
]);

export const role = sqliteTable("Role", {
  id: text("id").notNull().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isSystem: booleanColumn("isSystem").notNull().default(false),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Role_code_key").on(table.code),
]);

export const rolePermission = sqliteTable("RolePermission", {
  roleId: text("roleId").notNull().references(() => role.id, { onDelete: "cascade", onUpdate: "cascade" }),
  permissionId: text("permissionId").notNull().references(() => permission.id, { onDelete: "cascade", onUpdate: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
]);

export const sale = sqliteTable("Sale", {
  id: text("id").notNull().primaryKey(),
  invoiceNumber: text("invoiceNumber").notNull(),
  customerId: text("customerId").references(() => customer.id, { onDelete: "set null", onUpdate: "cascade" }),
  status: text("status").notNull().default('POSTED'),
  paymentStatus: text("paymentStatus").notNull(),
  saleType: text("saleType").notNull().default('RETAIL'),
  subtotalMinor: integer("subtotalMinor").notNull(),
  discountMinor: integer("discountMinor").notNull().default(0),
  taxMinor: integer("taxMinor").notNull().default(0),
  totalMinor: integer("totalMinor").notNull(),
  paidMinor: integer("paidMinor").notNull().default(0),
  previousBalanceMinor: integer("previousBalanceMinor").notNull().default(0),
  currentBalanceMinor: integer("currentBalanceMinor").notNull().default(0),
  dueDate: datetimeColumn("dueDate"),
  notes: text("notes"),
  fbrStatus: text("fbrStatus").notNull().default('PENDING'),
  fbrInvoiceNumber: text("fbrInvoiceNumber"),
  fbrScenarioId: text("fbrScenarioId"),
  fbrPayloadJson: text("fbrPayloadJson"),
  fbrRequestJson: text("fbrRequestJson"),
  fbrResponseJson: text("fbrResponseJson"),
  fbrQrData: text("fbrQrData"),
  fbrError: text("fbrError"),
  fbrRetryCount: integer("fbrRetryCount").notNull().default(0),
  fbrSubmittedAt: datetimeColumn("fbrSubmittedAt"),
  soldAt: datetimeColumn("soldAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  fbrPayloadHash: text("fbrPayloadHash"),
}, (table) => [
  index("Sale_fbrStatus_soldAt_idx").on(table.fbrStatus, table.soldAt),
  index("Sale_soldAt_status_idx").on(table.soldAt, table.status),
  index("Sale_customerId_soldAt_idx").on(table.customerId, table.soldAt),
  uniqueIndex("Sale_fbrInvoiceNumber_key").on(table.fbrInvoiceNumber),
  uniqueIndex("Sale_invoiceNumber_key").on(table.invoiceNumber),
]);

export const saleItem = sqliteTable("SaleItem", {
  id: text("id").notNull().primaryKey(),
  saleId: text("saleId").notNull().references(() => sale.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  packingName: text("packingName").notNull(),
  unitsPerPack: integer("unitsPerPack").notNull(),
  packQuantity: integer("packQuantity").notNull(),
  baseQuantity: integer("baseQuantity").notNull().default(0),
  quantityBase: integer("quantityBase").notNull(),
  unitPriceMinor: integer("unitPriceMinor").notNull(),
  costPriceMinor: integer("costPriceMinor").notNull(),
  discountMinor: integer("discountMinor").notNull().default(0),
  taxMinor: integer("taxMinor").notNull().default(0),
  taxRateBps: integer("taxRateBps").notNull().default(0),
  fbrHsCode: text("fbrHsCode"),
  fbrUom: text("fbrUom"),
  fbrSaleType: text("fbrSaleType"),
  fbrFixedNotifiedValueMinor: integer("fbrFixedNotifiedValueMinor").notNull().default(0),
  fbrSroScheduleNo: text("fbrSroScheduleNo"),
  fbrSroItemSerialNo: text("fbrSroItemSerialNo"),
  lineTotalMinor: integer("lineTotalMinor").notNull(),
}, (table) => [
  index("SaleItem_productId_batchId_idx").on(table.productId, table.batchId),
  index("SaleItem_saleId_idx").on(table.saleId),
]);

export const salesReturn = sqliteTable("SalesReturn", {
  id: text("id").notNull().primaryKey(),
  returnNumber: text("returnNumber").notNull(),
  saleId: text("saleId").notNull().references(() => sale.id, { onDelete: "restrict", onUpdate: "cascade" }),
  customerId: text("customerId").references(() => customer.id, { onDelete: "set null", onUpdate: "cascade" }),
  status: text("status").notNull().default('POSTED'),
  refundMethod: text("refundMethod").notNull(),
  totalMinor: integer("totalMinor").notNull(),
  returnTotalMinor: integer("returnTotalMinor").notNull(),
  replacementTotalMinor: integer("replacementTotalMinor").notNull().default(0),
  refundMinor: integer("refundMinor").notNull(),
  reason: text("reason").notNull(),
  returnedAt: datetimeColumn("returnedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("SalesReturn_saleId_returnedAt_idx").on(table.saleId, table.returnedAt),
  uniqueIndex("SalesReturn_returnNumber_key").on(table.returnNumber),
]);

export const salesReturnItem = sqliteTable("SalesReturnItem", {
  id: text("id").notNull().primaryKey(),
  salesReturnId: text("salesReturnId").notNull().references(() => salesReturn.id, { onDelete: "restrict", onUpdate: "cascade" }),
  saleItemId: text("saleItemId").notNull().references(() => saleItem.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  quantityBase: integer("quantityBase").notNull(),
  unitPriceMinor: integer("unitPriceMinor").notNull(),
  lineTotalMinor: integer("lineTotalMinor").notNull(),
  condition: text("condition").notNull(),
}, (table) => [
  index("SalesReturnItem_saleItemId_idx").on(table.saleItemId),
]);

export const salesReturnReplacementItem = sqliteTable("SalesReturnReplacementItem", {
  id: text("id").notNull().primaryKey(),
  salesReturnId: text("salesReturnId").notNull().references(() => salesReturn.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  packingName: text("packingName").notNull(),
  unitsPerPack: integer("unitsPerPack").notNull(),
  quantityBase: integer("quantityBase").notNull(),
  unitPriceMinor: integer("unitPriceMinor").notNull(),
  lineTotalMinor: integer("lineTotalMinor").notNull(),
}, (table) => [
  index("SalesReturnReplacementItem_productId_batchId_idx").on(table.productId, table.batchId),
  index("SalesReturnReplacementItem_salesReturnId_idx").on(table.salesReturnId),
]);

export const session = sqliteTable("Session", {
  id: text("id").notNull().primaryKey(),
  tokenHash: text("tokenHash").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  expiresAt: datetimeColumn("expiresAt").notNull(),
  revokedAt: datetimeColumn("revokedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Session_userId_expiresAt_idx").on(table.userId, table.expiresAt),
  uniqueIndex("Session_tokenHash_key").on(table.tokenHash),
]);

export const setting = sqliteTable("Setting", {
  key: text("key").notNull().primaryKey(),
  valueJson: text("valueJson").notNull(),
  isSecret: booleanColumn("isSecret").notNull().default(false),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockCount = sqliteTable("StockCount", {
  id: text("id").notNull().primaryKey(),
  countNumber: text("countNumber").notNull(),
  status: text("status").notNull().default('POSTED'),
  notes: text("notes"),
  countedAt: datetimeColumn("countedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("StockCount_createdById_countedAt_idx").on(table.createdById, table.countedAt),
  index("StockCount_countedAt_status_idx").on(table.countedAt, table.status),
  uniqueIndex("StockCount_countNumber_key").on(table.countNumber),
]);

export const stockCountItem = sqliteTable("StockCountItem", {
  id: text("id").notNull().primaryKey(),
  stockCountId: text("stockCountId").notNull().references(() => stockCount.id, { onDelete: "restrict", onUpdate: "cascade" }),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  expectedBaseQty: integer("expectedBaseQty").notNull(),
  countedBaseQty: integer("countedBaseQty").notNull(),
  varianceBaseQty: integer("varianceBaseQty").notNull(),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("StockCountItem_stockCountId_productId_batchId_key").on(table.stockCountId, table.productId, table.batchId),
  index("StockCountItem_batchId_createdAt_idx").on(table.batchId, table.createdAt),
  index("StockCountItem_productId_createdAt_idx").on(table.productId, table.createdAt),
]);

export const stockMovement = sqliteTable("StockMovement", {
  id: text("id").notNull().primaryKey(),
  productId: text("productId").notNull().references(() => product.id, { onDelete: "restrict", onUpdate: "cascade" }),
  batchId: text("batchId").references(() => productBatch.id, { onDelete: "set null", onUpdate: "cascade" }),
  movementType: text("movementType").notNull(),
  quantityBase: integer("quantityBase").notNull(),
  balanceAfterBase: integer("balanceAfterBase").notNull(),
  batchBalanceAfterBase: integer("batchBalanceAfterBase"),
  unitCostMinor: integer("unitCostMinor").notNull().default(0),
  valueMinor: integer("valueMinor").notNull().default(0),
  sourceType: text("sourceType").notNull(),
  sourceId: text("sourceId").notNull(),
  sourceLineId: text("sourceLineId").notNull(),
  notes: text("notes"),
  createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("StockMovement_sourceType_sourceId_sourceLineId_key").on(table.sourceType, table.sourceId, table.sourceLineId),
  index("StockMovement_sourceType_sourceId_idx").on(table.sourceType, table.sourceId),
  index("StockMovement_batchId_createdAt_idx").on(table.batchId, table.createdAt),
  index("StockMovement_productId_createdAt_idx").on(table.productId, table.createdAt),
]);

export const supplier = sqliteTable("Supplier", {
  id: text("id").notNull().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  businessName: text("businessName"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  taxIdentifier: text("taxIdentifier"),
  openingBalanceMinor: integer("openingBalanceMinor").notNull().default(0),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("Supplier_businessName_idx").on(table.businessName),
  index("Supplier_phone_idx").on(table.phone),
  index("Supplier_name_idx").on(table.name),
  uniqueIndex("Supplier_code_key").on(table.code),
]);

export const supplierLedger = sqliteTable("SupplierLedger", {
  id: text("id").notNull().primaryKey(),
  supplierId: text("supplierId").notNull().references(() => supplier.id, { onDelete: "restrict", onUpdate: "cascade" }),
  entryType: text("entryType").notNull(),
  debitMinor: integer("debitMinor").notNull().default(0),
  creditMinor: integer("creditMinor").notNull().default(0),
  sourceType: text("sourceType").notNull(),
  sourceId: text("sourceId").notNull(),
  purchaseId: text("purchaseId").references(() => purchase.id, { onDelete: "set null", onUpdate: "cascade" }),
  paymentId: text("paymentId").references((): any => payment.id, { onDelete: "set null", onUpdate: "cascade" }),
  notes: text("notes"),
  dueDate: datetimeColumn("dueDate"),
  reversalOfEntryId: text("reversalOfEntryId").references((): any => supplierLedger.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdById: text("createdById").references(() => user.id, { onDelete: "set null", onUpdate: "cascade" }),
  occurredAt: datetimeColumn("occurredAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("SupplierLedger_sourceType_sourceId_entryType_key").on(table.sourceType, table.sourceId, table.entryType),
  index("SupplierLedger_supplierId_occurredAt_idx").on(table.supplierId, table.occurredAt),
  uniqueIndex("SupplierLedger_reversalOfEntryId_key").on(table.reversalOfEntryId),
]);

export const unit = sqliteTable("Unit", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  isActive: booleanColumn("isActive").notNull().default(true),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("Unit_symbol_key").on(table.symbol),
  uniqueIndex("Unit_name_key").on(table.name),
]);

export const user = sqliteTable("User", {
  id: text("id").notNull().primaryKey(),
  username: text("username").notNull(),
  displayName: text("displayName").notNull(),
  passwordHash: text("passwordHash").notNull(),
  ownerPinHash: text("ownerPinHash"),
  roleId: text("roleId").notNull().references(() => role.id, { onDelete: "restrict", onUpdate: "cascade" }),
  isActive: booleanColumn("isActive").notNull().default(true),
  cashierDiscountLimitBps: integer("cashierDiscountLimitBps").notNull().default(0),
  failedLoginAttempts: integer("failedLoginAttempts").notNull().default(0),
  lockedUntil: datetimeColumn("lockedUntil"),
  lastLoginAt: datetimeColumn("lastLoginAt"),
  deletedAt: datetimeColumn("deletedAt"),
  createdAt: datetimeColumn("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetimeColumn("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("User_roleId_isActive_idx").on(table.roleId, table.isActive),
  uniqueIndex("User_username_key").on(table.username),
]);

export const accountRelations = relations(account, ({ one, many }) => ({
  parent: one(account, { fields: [account.parentId], references: [account.id] }),
  accounts: many(account),
  bankAccounts: many(bankAccount),
  expenseCategorys: many(expenseCategory),
  journalLines: many(journalLine),
}));

export const auditLogRelations = relations(auditLog, ({ one, many }) => ({
  user: one(user, { fields: [auditLog.userId], references: [user.id] }),
}));

export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  glAccount: one(account, { fields: [bankAccount.glAccountId], references: [account.id] }),
  expenses: many(expense),
  financialTransactions: many(financialTransaction),
  financialTransactions2: many(financialTransaction),
  payments: many(payment),
}));

export const brandRelations = relations(brand, ({ one, many }) => ({
  products: many(product),
}));

export const cashbookEntryRelations = relations(cashbookEntry, ({ one, many }) => ({
  createdBy: one(user, { fields: [cashbookEntry.createdById], references: [user.id] }),
  reversalOf: one(cashbookEntry, { fields: [cashbookEntry.reversalOfId], references: [cashbookEntry.id] }),
  expense: one(expense, { fields: [cashbookEntry.expenseId], references: [expense.id] }),
  salesReturn: one(salesReturn, { fields: [cashbookEntry.salesReturnId], references: [salesReturn.id] }),
  payment: one(payment, { fields: [cashbookEntry.paymentId], references: [payment.id] }),
  cashbookEntrys: many(cashbookEntry),
}));

export const categoryRelations = relations(category, ({ one, many }) => ({
  products: many(product),
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
  customerLedgers: many(customerLedger),
  journalLines: many(journalLine),
  payments: many(payment),
  sales: many(sale),
  salesReturns: many(salesReturn),
}));

export const customerLedgerRelations = relations(customerLedger, ({ one, many }) => ({
  createdBy: one(user, { fields: [customerLedger.createdById], references: [user.id] }),
  reversalOfEntry: one(customerLedger, { fields: [customerLedger.reversalOfEntryId], references: [customerLedger.id] }),
  salesReturn: one(salesReturn, { fields: [customerLedger.salesReturnId], references: [salesReturn.id] }),
  payment: one(payment, { fields: [customerLedger.paymentId], references: [payment.id] }),
  sale: one(sale, { fields: [customerLedger.saleId], references: [sale.id] }),
  customer: one(customer, { fields: [customerLedger.customerId], references: [customer.id] }),
  customerLedgers: many(customerLedger),
}));

export const dailyClosingRelations = relations(dailyClosing, ({ one, many }) => ({
  closedBy: one(user, { fields: [dailyClosing.closedById], references: [user.id] }),
}));

export const damageEntryRelations = relations(damageEntry, ({ one, many }) => ({
  createdBy: one(user, { fields: [damageEntry.createdById], references: [user.id] }),
  batch: one(productBatch, { fields: [damageEntry.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [damageEntry.productId], references: [product.id] }),
}));

export const discountApprovalRelations = relations(discountApproval, ({ one, many }) => ({
  approvedBy: one(user, { fields: [discountApproval.approvedById], references: [user.id] }),
  requestedBy: one(user, { fields: [discountApproval.requestedById], references: [user.id] }),
}));

export const expenseRelations = relations(expense, ({ one, many }) => ({
  voidedBy: one(user, { fields: [expense.voidedById], references: [user.id] }),
  createdBy: one(user, { fields: [expense.createdById], references: [user.id] }),
  bankAccount: one(bankAccount, { fields: [expense.bankAccountId], references: [bankAccount.id] }),
  category: one(expenseCategory, { fields: [expense.categoryId], references: [expenseCategory.id] }),
  cashbookEntrys: many(cashbookEntry),
}));

export const expenseCategoryRelations = relations(expenseCategory, ({ one, many }) => ({
  account: one(account, { fields: [expenseCategory.accountId], references: [account.id] }),
  expenses: many(expense),
}));

export const financialPeriodRelations = relations(financialPeriod, ({ one, many }) => ({
  journalEntrys: many(journalEntry),
}));

export const financialTransactionRelations = relations(financialTransaction, ({ one, many }) => ({
  createdBy: one(user, { fields: [financialTransaction.createdById], references: [user.id] }),
  toBankAccount: one(bankAccount, { fields: [financialTransaction.toBankAccountId], references: [bankAccount.id] }),
  fromBankAccount: one(bankAccount, { fields: [financialTransaction.fromBankAccountId], references: [bankAccount.id] }),
}));

export const heldSaleRelations = relations(heldSale, ({ one, many }) => ({
  createdBy: one(user, { fields: [heldSale.createdById], references: [user.id] }),
}));

export const journalEntryRelations = relations(journalEntry, ({ one, many }) => ({
  createdBy: one(user, { fields: [journalEntry.createdById], references: [user.id] }),
  reversalOf: one(journalEntry, { fields: [journalEntry.reversalOfId], references: [journalEntry.id] }),
  period: one(financialPeriod, { fields: [journalEntry.periodId], references: [financialPeriod.id] }),
  journalEntrys: many(journalEntry),
  journalLines: many(journalLine),
}));

export const journalLineRelations = relations(journalLine, ({ one, many }) => ({
  product: one(product, { fields: [journalLine.productId], references: [product.id] }),
  supplier: one(supplier, { fields: [journalLine.supplierId], references: [supplier.id] }),
  customer: one(customer, { fields: [journalLine.customerId], references: [customer.id] }),
  account: one(account, { fields: [journalLine.accountId], references: [account.id] }),
  journal: one(journalEntry, { fields: [journalLine.journalId], references: [journalEntry.id] }),
}));

export const loginHistoryRelations = relations(loginHistory, ({ one, many }) => ({
  user: one(user, { fields: [loginHistory.userId], references: [user.id] }),
}));

export const paymentRelations = relations(payment, ({ one, many }) => ({
  createdBy: one(user, { fields: [payment.createdById], references: [user.id] }),
  reversalOf: one(payment, { fields: [payment.reversalOfId], references: [payment.id] }),
  bankAccount: one(bankAccount, { fields: [payment.bankAccountId], references: [bankAccount.id] }),
  purchase: one(purchase, { fields: [payment.purchaseId], references: [purchase.id] }),
  sale: one(sale, { fields: [payment.saleId], references: [sale.id] }),
  supplier: one(supplier, { fields: [payment.supplierId], references: [supplier.id] }),
  customer: one(customer, { fields: [payment.customerId], references: [customer.id] }),
  cashbookEntrys: many(cashbookEntry),
  customerLedgers: many(customerLedger),
  payments: many(payment),
  supplierLedgers: many(supplierLedger),
}));

export const permissionRelations = relations(permission, ({ one, many }) => ({
  rolePermissions: many(rolePermission),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  baseUnit: one(unit, { fields: [product.baseUnitId], references: [unit.id] }),
  brand: one(brand, { fields: [product.brandId], references: [brand.id] }),
  category: one(category, { fields: [product.categoryId], references: [category.id] }),
  damageEntrys: many(damageEntry),
  journalLines: many(journalLine),
  productBatchs: many(productBatch),
  productPackings: many(productPacking),
  purchaseItems: many(purchaseItem),
  purchaseReturnItems: many(purchaseReturnItem),
  saleItems: many(saleItem),
  salesReturnItems: many(salesReturnItem),
  salesReturnReplacementItems: many(salesReturnReplacementItem),
  stockCountItems: many(stockCountItem),
  stockMovements: many(stockMovement),
}));

export const productBatchRelations = relations(productBatch, ({ one, many }) => ({
  product: one(product, { fields: [productBatch.productId], references: [product.id] }),
  damageEntrys: many(damageEntry),
  purchaseItems: many(purchaseItem),
  purchaseReturnItems: many(purchaseReturnItem),
  saleItems: many(saleItem),
  salesReturnItems: many(salesReturnItem),
  salesReturnReplacementItems: many(salesReturnReplacementItem),
  stockCountItems: many(stockCountItem),
  stockMovements: many(stockMovement),
}));

export const productPackingRelations = relations(productPacking, ({ one, many }) => ({
  unit: one(unit, { fields: [productPacking.unitId], references: [unit.id] }),
  product: one(product, { fields: [productPacking.productId], references: [product.id] }),
}));

export const purchaseRelations = relations(purchase, ({ one, many }) => ({
  createdBy: one(user, { fields: [purchase.createdById], references: [user.id] }),
  supplier: one(supplier, { fields: [purchase.supplierId], references: [supplier.id] }),
  payments: many(payment),
  purchaseItems: many(purchaseItem),
  purchaseReturns: many(purchaseReturn),
  supplierLedgers: many(supplierLedger),
}));

export const purchaseItemRelations = relations(purchaseItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [purchaseItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [purchaseItem.productId], references: [product.id] }),
  purchase: one(purchase, { fields: [purchaseItem.purchaseId], references: [purchase.id] }),
  purchaseReturnItems: many(purchaseReturnItem),
}));

export const purchaseReturnRelations = relations(purchaseReturn, ({ one, many }) => ({
  createdBy: one(user, { fields: [purchaseReturn.createdById], references: [user.id] }),
  supplier: one(supplier, { fields: [purchaseReturn.supplierId], references: [supplier.id] }),
  purchase: one(purchase, { fields: [purchaseReturn.purchaseId], references: [purchase.id] }),
  purchaseReturnItems: many(purchaseReturnItem),
}));

export const purchaseReturnItemRelations = relations(purchaseReturnItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [purchaseReturnItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [purchaseReturnItem.productId], references: [product.id] }),
  purchaseItem: one(purchaseItem, { fields: [purchaseReturnItem.purchaseItemId], references: [purchaseItem.id] }),
  purchaseReturn: one(purchaseReturn, { fields: [purchaseReturnItem.purchaseReturnId], references: [purchaseReturn.id] }),
}));

export const roleRelations = relations(role, ({ one, many }) => ({
  rolePermissions: many(rolePermission),
  users: many(user),
}));

export const rolePermissionRelations = relations(rolePermission, ({ one, many }) => ({
  permission: one(permission, { fields: [rolePermission.permissionId], references: [permission.id] }),
  role: one(role, { fields: [rolePermission.roleId], references: [role.id] }),
}));

export const saleRelations = relations(sale, ({ one, many }) => ({
  createdBy: one(user, { fields: [sale.createdById], references: [user.id] }),
  customer: one(customer, { fields: [sale.customerId], references: [customer.id] }),
  customerLedgers: many(customerLedger),
  payments: many(payment),
  saleItems: many(saleItem),
  salesReturns: many(salesReturn),
}));

export const saleItemRelations = relations(saleItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [saleItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [saleItem.productId], references: [product.id] }),
  sale: one(sale, { fields: [saleItem.saleId], references: [sale.id] }),
  salesReturnItems: many(salesReturnItem),
}));

export const salesReturnRelations = relations(salesReturn, ({ one, many }) => ({
  createdBy: one(user, { fields: [salesReturn.createdById], references: [user.id] }),
  customer: one(customer, { fields: [salesReturn.customerId], references: [customer.id] }),
  sale: one(sale, { fields: [salesReturn.saleId], references: [sale.id] }),
  cashbookEntrys: many(cashbookEntry),
  customerLedgers: many(customerLedger),
  salesReturnItems: many(salesReturnItem),
  salesReturnReplacementItems: many(salesReturnReplacementItem),
}));

export const salesReturnItemRelations = relations(salesReturnItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [salesReturnItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [salesReturnItem.productId], references: [product.id] }),
  saleItem: one(saleItem, { fields: [salesReturnItem.saleItemId], references: [saleItem.id] }),
  salesReturn: one(salesReturn, { fields: [salesReturnItem.salesReturnId], references: [salesReturn.id] }),
}));

export const salesReturnReplacementItemRelations = relations(salesReturnReplacementItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [salesReturnReplacementItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [salesReturnReplacementItem.productId], references: [product.id] }),
  salesReturn: one(salesReturn, { fields: [salesReturnReplacementItem.salesReturnId], references: [salesReturn.id] }),
}));

export const sessionRelations = relations(session, ({ one, many }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const stockCountRelations = relations(stockCount, ({ one, many }) => ({
  createdBy: one(user, { fields: [stockCount.createdById], references: [user.id] }),
  stockCountItems: many(stockCountItem),
}));

export const stockCountItemRelations = relations(stockCountItem, ({ one, many }) => ({
  batch: one(productBatch, { fields: [stockCountItem.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [stockCountItem.productId], references: [product.id] }),
  stockCount: one(stockCount, { fields: [stockCountItem.stockCountId], references: [stockCount.id] }),
}));

export const stockMovementRelations = relations(stockMovement, ({ one, many }) => ({
  createdBy: one(user, { fields: [stockMovement.createdById], references: [user.id] }),
  batch: one(productBatch, { fields: [stockMovement.batchId], references: [productBatch.id] }),
  product: one(product, { fields: [stockMovement.productId], references: [product.id] }),
}));

export const supplierRelations = relations(supplier, ({ one, many }) => ({
  journalLines: many(journalLine),
  payments: many(payment),
  purchases: many(purchase),
  purchaseReturns: many(purchaseReturn),
  supplierLedgers: many(supplierLedger),
}));

export const supplierLedgerRelations = relations(supplierLedger, ({ one, many }) => ({
  createdBy: one(user, { fields: [supplierLedger.createdById], references: [user.id] }),
  reversalOfEntry: one(supplierLedger, { fields: [supplierLedger.reversalOfEntryId], references: [supplierLedger.id] }),
  payment: one(payment, { fields: [supplierLedger.paymentId], references: [payment.id] }),
  purchase: one(purchase, { fields: [supplierLedger.purchaseId], references: [purchase.id] }),
  supplier: one(supplier, { fields: [supplierLedger.supplierId], references: [supplier.id] }),
  supplierLedgers: many(supplierLedger),
}));

export const unitRelations = relations(unit, ({ one, many }) => ({
  products: many(product),
  productPackings: many(productPacking),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  role: one(role, { fields: [user.roleId], references: [role.id] }),
  auditLogs: many(auditLog),
  cashbookEntrys: many(cashbookEntry),
  customerLedgers: many(customerLedger),
  dailyClosings: many(dailyClosing),
  damageEntrys: many(damageEntry),
  discountApprovals: many(discountApproval),
  discountApprovals2: many(discountApproval),
  expenses: many(expense),
  expenses2: many(expense),
  financialTransactions: many(financialTransaction),
  heldSales: many(heldSale),
  journalEntrys: many(journalEntry),
  loginHistorys: many(loginHistory),
  payments: many(payment),
  purchases: many(purchase),
  purchaseReturns: many(purchaseReturn),
  sales: many(sale),
  salesReturns: many(salesReturn),
  sessions: many(session),
  stockCounts: many(stockCount),
  stockMovements: many(stockMovement),
  supplierLedgers: many(supplierLedger),
}));

export type DbSchema = typeof import("./schema.js");
