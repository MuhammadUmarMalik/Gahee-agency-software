import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { HttpError } from "../../lib/http-error.js";
import { pakistanBusinessDate } from "../../lib/business-time.js";

export type SystemAccountCode = "CASH" | "BANK_CLEARING" | "AR" | "INVENTORY" | "INPUT_TAX" | "AP" | "OUTPUT_TAX" | "CAPITAL" | "DRAWINGS" | "OPENING_EQUITY" | "RETAINED_EARNINGS" | "SALES" | "OTHER_INCOME" | "SALES_RETURNS" | "SALES_DISCOUNTS" | "COGS" | "INVENTORY_LOSS" | "EXPENSE_GENERAL" | "CASH_OVER_SHORT";

export type PostingLine = {
  accountId?: string;
  systemCode?: SystemAccountCode;
  debitMinor?: number;
  creditMinor?: number;
  customerId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
  memo?: string | null;
};

export type PostJournalInput = {
  sourceType: SourceType;
  sourceId: string;
  postingKey?: string;
  transactionDate: Date;
  description: string;
  createdById: string;
  lines: PostingLine[];
};

const SYSTEM_ACCOUNTS: Array<{ code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "CONTRA_REVENUE" | "EXPENSE"; normalBalance: "DEBIT" | "CREDIT"; systemCode: SystemAccountCode }> = [
  { code: "1010", name: "Cash in Hand", type: "ASSET", normalBalance: "DEBIT", systemCode: "CASH" },
  { code: "1020", name: "Bank Clearing", type: "ASSET", normalBalance: "DEBIT", systemCode: "BANK_CLEARING" },
  { code: "1100", name: "Customer Receivables", type: "ASSET", normalBalance: "DEBIT", systemCode: "AR" },
  { code: "1200", name: "Inventory", type: "ASSET", normalBalance: "DEBIT", systemCode: "INVENTORY" },
  { code: "1300", name: "Input Tax", type: "ASSET", normalBalance: "DEBIT", systemCode: "INPUT_TAX" },
  { code: "2100", name: "Supplier Payables", type: "LIABILITY", normalBalance: "CREDIT", systemCode: "AP" },
  { code: "2200", name: "Output Tax", type: "LIABILITY", normalBalance: "CREDIT", systemCode: "OUTPUT_TAX" },
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
];

const reference = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const yearPeriod = (date: Date) => {
  const year = date.getUTCFullYear();
  return {
    name: `${year}`,
    startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
};

export class AccountingPostingService {
  static async ensureFoundation(tx: TransactionClient, transactionDate: Date) {
    for (const account of SYSTEM_ACCOUNTS) {
      await tx.account.upsert({ where: { code: account.code }, update: { name: account.name, type: account.type, normalBalance: account.normalBalance, systemCode: account.systemCode, isSystem: true, isActive: true, deletedAt: null }, create: { ...account, isSystem: true } });
    }
    const period = yearPeriod(transactionDate);
    const existing = await tx.financialPeriod.findFirst({ where: { startDate: { lte: transactionDate }, endDate: { gte: transactionDate } }, select: { id: true } });
    if (existing) return;
    await tx.financialPeriod.upsert({
      where: { name: period.name },
      update: { startDate: period.startDate, endDate: period.endDate },
      create: period,
    });
  }

  static async accountId(tx: TransactionClient, systemCode: SystemAccountCode) {
    const account = await tx.account.findUnique({ where: { systemCode }, select: { id: true, isActive: true } });
    if (!account?.isActive) throw new HttpError(500, "ACCOUNT_MAPPING_MISSING", `Accounting account ${systemCode} is not configured.`);
    return account.id;
  }

  static async tenderAccountId(tx: TransactionClient, method: PaymentMethod, bankAccountId?: string | null) {
    if (method === "CASH") return this.accountId(tx, "CASH");
    if (bankAccountId) {
      const bank = await tx.bankAccount.findFirst({ where: { id: bankAccountId, isActive: true, deletedAt: null }, select: { glAccountId: true } });
      if (!bank) throw new HttpError(400, "INVALID_BANK_ACCOUNT", "Select an active bank account.");
      return bank.glAccountId;
    }
    return this.accountId(tx, "BANK_CLEARING");
  }

  static async assertOpenPeriod(tx: TransactionClient, transactionDate: Date) {
    await this.ensureFoundation(tx, transactionDate);
    const fallback = yearPeriod(transactionDate);
    const period =
      (await tx.financialPeriod.findFirst({ where: { startDate: { lte: transactionDate }, endDate: { gte: transactionDate } }, orderBy: { startDate: "desc" } })) ??
      (await tx.financialPeriod.findUnique({ where: { name: fallback.name } }));
    if (!period) throw new HttpError(409, "FINANCIAL_PERIOD_MISSING", "No financial period covers this transaction date.");
    if (period.status !== "OPEN") throw new HttpError(409, "FINANCIAL_PERIOD_CLOSED", `Financial period ${period.name} is ${period.status.toLowerCase()}.`);
    return period;
  }

  static async assertCashDayOpen(tx: TransactionClient, transactionDate: Date) {
    const day = pakistanBusinessDate(transactionDate);
    await this.reopenPrematureAutomaticClosing(tx, day);
    if (await tx.dailyClosing.findUnique({ where: { businessDate: day }, select: { id: true } })) {
      throw new HttpError(409, "DAY_ALREADY_CLOSED", "Cash activity cannot be posted after the business day is closed.");
    }
  }

  private static async reopenPrematureAutomaticClosing(tx: TransactionClient, businessDate: Date) {
    if (businessDate.valueOf() !== pakistanBusinessDate().valueOf()) return;
    const closing = await tx.dailyClosing.findUnique({ where: { businessDate }, select: { id: true, notes: true } });
    if (closing?.notes?.startsWith("Automatically closed at")) await tx.dailyClosing.delete({ where: { id: closing.id } });
  }

  static async post(tx: TransactionClient, input: PostJournalInput) {
    const postingKey = input.postingKey ?? "PRIMARY";
    const existing = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: input.sourceType, sourceId: input.sourceId, postingKey } }, include: { lines: true } });
    if (existing) return existing;
    const period = await this.assertOpenPeriod(tx, input.transactionDate);
    if (input.lines.length < 2) throw new HttpError(400, "JOURNAL_TOO_SHORT", "A journal must contain at least two lines.");
    const accounts = new Map<SystemAccountCode, string>();
    const resolved = [];
    for (const line of input.lines) {
      const debitMinor = line.debitMinor ?? 0;
      const creditMinor = line.creditMinor ?? 0;
      if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor) || debitMinor < 0 || creditMinor < 0 || (debitMinor > 0) === (creditMinor > 0)) {
        throw new HttpError(400, "INVALID_JOURNAL_LINE", "Each journal line must contain one positive debit or credit.");
      }
      let accountId = line.accountId;
      if (!accountId && line.systemCode) {
        accountId = accounts.get(line.systemCode);
        if (!accountId) { accountId = await this.accountId(tx, line.systemCode); accounts.set(line.systemCode, accountId); }
      }
      if (!accountId) throw new HttpError(400, "ACCOUNT_REQUIRED", "Every journal line requires an account.");
      resolved.push({ ...line, accountId, debitMinor, creditMinor });
    }
    const totalDebitMinor = resolved.reduce((sum, line) => sum + line.debitMinor, 0);
    const totalCreditMinor = resolved.reduce((sum, line) => sum + line.creditMinor, 0);
    if (!Number.isSafeInteger(totalDebitMinor) || totalDebitMinor <= 0 || totalDebitMinor !== totalCreditMinor) {
      throw new HttpError(400, "UNBALANCED_JOURNAL", `Journal is not balanced: debit ${totalDebitMinor}, credit ${totalCreditMinor}.`);
    }
    return tx.journalEntry.create({
      data: {
        entryNumber: reference("JV"), sourceType: input.sourceType, sourceId: input.sourceId, postingKey,
        transactionDate: input.transactionDate, description: input.description, periodId: period.id,
        totalDebitMinor, totalCreditMinor, createdById: input.createdById,
        lines: { create: resolved.map((line, index) => ({ lineNumber: index + 1, accountId: line.accountId, debitMinor: line.debitMinor, creditMinor: line.creditMinor, customerId: line.customerId ?? null, supplierId: line.supplierId ?? null, productId: line.productId ?? null, memo: line.memo ?? null })) },
      },
      include: { lines: true },
    });
  }

  static async reverse(tx: TransactionClient, journalId: string, reason: string, userId: string, transactionDate = new Date()) {
    const original = await tx.journalEntry.findUnique({ where: { id: journalId }, include: { lines: true, reversalEntry: true } });
    if (!original) throw new HttpError(404, "JOURNAL_NOT_FOUND", "Journal entry was not found.");
    if (original.status !== "POSTED" || original.reversalEntry) throw new HttpError(409, "JOURNAL_ALREADY_REVERSED", "Journal entry has already been reversed.");
    const reversal = await this.post(tx, {
      sourceType: original.sourceType, sourceId: original.id, postingKey: "REVERSAL", transactionDate,
      description: `Reversal of ${original.entryNumber}: ${reason}`, createdById: userId,
      lines: original.lines.map((line) => ({ accountId: line.accountId, debitMinor: line.creditMinor, creditMinor: line.debitMinor, customerId: line.customerId, supplierId: line.supplierId, productId: line.productId, memo: reason })),
    });
    await tx.journalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: original.id, reversalReason: reason } });
    await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", reversalReason: reason } });
    return reversal;
  }
}
