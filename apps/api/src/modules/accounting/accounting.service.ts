import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import type { AccountInput, AccountUpdateInput, AccountingCutoverInput, BankAccountInput, FinancialPeriodInput, FinancialReportFilter, FinancialTransactionInput, JournalFilter, ManualJournalInput } from "@oil-agency/shared";
import { isUniqueConstraintError } from "../../lib/db-errors.js";
import { HttpError } from "../../lib/http-error.js";
import { moneyToMinor, minorToMoney } from "../products/product.service.js";
import { AccountingPostingService, type PostingLine } from "./posting.service.js";

const atNoon = (date: string) => new Date(`${date}T12:00:00.000Z`);
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999Z`);
const documentNumber = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const journalInclude = {
  period: { select: { id: true, name: true, status: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
  reversalOf: { select: { id: true, entryNumber: true } },
  reversalEntry: { select: { id: true, entryNumber: true } },
  lines: { include: { account: { select: { id: true, code: true, name: true, type: true } }, customer: { select: { id: true, code: true, name: true } }, supplier: { select: { id: true, code: true, name: true } }, product: { select: { id: true, sku: true, name: true } } }, orderBy: { lineNumber: "asc" as const } },
} satisfies Record<string, unknown>;

export class AccountingService {
  constructor(private readonly db: AppDbClient) {}

  async bootstrap() {
    await this.db.$transaction((tx) => AccountingPostingService.ensureFoundation(tx, new Date()));
  }

  async accounts(includeInactive = false) {
    await this.bootstrap();
    return this.db.account.findMany({ where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) }, include: { parent: { select: { id: true, code: true, name: true } }, _count: { select: { journalLines: true, children: true } } }, orderBy: { code: "asc" } });
  }

  async createAccount(input: AccountInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      if (input.parentId && !await tx.account.findFirst({ where: { id: input.parentId, isActive: true, deletedAt: null } })) throw new HttpError(400, "INVALID_PARENT_ACCOUNT", "Parent account is unavailable.");
      const account = await tx.account.create({ data: { ...input, parentId: input.parentId ?? null } });
      await tx.auditLog.create({ data: { userId, action: "CREATE", entityType: "Account", entityId: account.id, afterJson: JSON.stringify(account) } });
      return account;
    }).catch((error) => { if (isUniqueConstraintError(error)) throw new HttpError(409, "ACCOUNT_EXISTS", "An account with this code already exists."); throw error; });
  }

  async updateAccount(id: string, input: AccountUpdateInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.account.findUnique({ where: { id } });
      if (!current || current.deletedAt) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
      if (current.isSystem && (input.type || input.normalBalance || input.code)) throw new HttpError(409, "SYSTEM_ACCOUNT_PROTECTED", "System account classification and code cannot be changed.");
      if (input.parentId === id) throw new HttpError(400, "ACCOUNT_CYCLE", "An account cannot be its own parent.");
      const data: any = {}; if (input.code !== undefined) data.code = input.code; if (input.name !== undefined) data.name = input.name; if (input.type !== undefined) data.type = input.type; if (input.normalBalance !== undefined) data.normalBalance = input.normalBalance; if (input.allowManual !== undefined) data.allowManual = input.allowManual; if (input.isActive !== undefined) data.isActive = input.isActive; if (input.parentId !== undefined) data.parent = input.parentId === null ? { disconnect: true } : { connect: { id: input.parentId } }; const account = await tx.account.update({ where: { id }, data });
      await tx.auditLog.create({ data: { userId, action: input.isActive === false ? "DEACTIVATE" : input.isActive === true ? "ACTIVATE" : "UPDATE", entityType: "Account", entityId: id, beforeJson: JSON.stringify(current), afterJson: JSON.stringify(account) } });
      return account;
    });
  }

  async periods() { await this.bootstrap(); return this.db.financialPeriod.findMany({ orderBy: { startDate: "desc" } }); }

  async createPeriod(input: FinancialPeriodInput, userId: string) {
    const startDate = atNoon(input.startDate), endDate = atNoon(input.endDate);
    return this.db.$transaction(async (tx) => {
      if (await tx.financialPeriod.findFirst({ where: { startDate: { lte: endDate }, endDate: { gte: startDate } } })) throw new HttpError(409, "PERIOD_OVERLAP", "Financial periods cannot overlap.");
      const period = await tx.financialPeriod.create({ data: { name: input.name, startDate, endDate } });
      await tx.auditLog.create({ data: { userId, action: "CREATE", entityType: "FinancialPeriod", entityId: period.id, afterJson: JSON.stringify(period) } });
      return period;
    });
  }

  async changePeriod(id: string, action: "CLOSE" | "REOPEN" | "LOCK", userId: string) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.financialPeriod.findUnique({ where: { id } });
      if (!current) throw new HttpError(404, "PERIOD_NOT_FOUND", "Financial period was not found.");
      if (current.status === "LOCKED") throw new HttpError(409, "PERIOD_LOCKED", "A locked period cannot be changed.");
      if (action === "LOCK" && current.status !== "CLOSED") throw new HttpError(409, "PERIOD_NOT_CLOSED", "Close the period before locking it.");
      const status = action === "REOPEN" ? "OPEN" : action === "LOCK" ? "LOCKED" : "CLOSED";
      const period = await tx.financialPeriod.update({ where: { id }, data: { status, closedAt: status === "OPEN" ? null : new Date(), closedById: status === "OPEN" ? null : userId } });
      await tx.auditLog.create({ data: { userId, action: action === "REOPEN" ? "REOPEN" : "CLOSE", entityType: "FinancialPeriod", entityId: id, beforeJson: JSON.stringify(current), afterJson: JSON.stringify(period) } });
      return period;
    });
  }

  async journals(filter: JournalFilter) {
    const where: any = { transactionDate: { gte: atNoon(filter.from), lte: endOfDay(filter.to) }, ...(filter.status ? { status: filter.status } : {}), ...(filter.accountId ? { lines: { some: { accountId: filter.accountId } } } : {}), ...(filter.search ? { OR: [{ entryNumber: { contains: filter.search } }, { description: { contains: filter.search } }, { sourceId: { contains: filter.search } }] } : {}) };
    const rows = await this.db.journalEntry.findMany({ where, include: journalInclude, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }] });
    return rows.map(journalDto);
  }

  async journal(id: string) { const row = await this.db.journalEntry.findUnique({ where: { id }, include: journalInclude }); if (!row) throw new HttpError(404, "JOURNAL_NOT_FOUND", "Journal entry was not found."); return journalDto(row); }

  async createManualJournal(input: ManualJournalInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
      const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, isActive: true, deletedAt: null } });
      if (accounts.length !== accountIds.length || accounts.some((account) => !account.allowManual)) throw new HttpError(403, "MANUAL_POSTING_NOT_ALLOWED", "One or more accounts do not allow manual journal entries.");
      const journal = await AccountingPostingService.post(tx, { sourceType: "MANUAL_ADJUSTMENT", sourceId: input.reference, transactionDate: atNoon(input.transactionDate), description: input.description, createdById: userId, lines: input.lines.map((line) => ({ accountId: line.accountId, debitMinor: moneyToMinor(String(line.debit)), creditMinor: moneyToMinor(String(line.credit)), ...(line.customerId !== undefined ? { customerId: line.customerId } : {}), ...(line.supplierId !== undefined ? { supplierId: line.supplierId } : {}), ...(line.productId !== undefined ? { productId: line.productId } : {}), ...(line.memo !== undefined ? { memo: line.memo } : {}) })) });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "JournalEntry", entityId: journal.id, afterJson: JSON.stringify({ reference: input.reference, description: input.description, totalMinor: journal.totalDebitMinor }) } });
      return journal;
    });
  }

  async reverseJournal(id: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const original = await tx.journalEntry.findUnique({ where: { id } });
      if (!original) throw new HttpError(404, "JOURNAL_NOT_FOUND", "Journal entry was not found.");
      if (original.sourceType !== "MANUAL_ADJUSTMENT" && original.sourceType !== "FINANCIAL_TRANSACTION") throw new HttpError(409, "SOURCE_REVERSAL_REQUIRED", "Reverse this entry from its source transaction so stock, ledger, and cash records remain connected.");
      const reversal = await AccountingPostingService.reverse(tx, id, reason, userId);
      if (original.sourceType === "FINANCIAL_TRANSACTION") await tx.financialTransaction.update({ where: { id: original.sourceId }, data: { status: "VOIDED" } });
      await tx.auditLog.create({ data: { userId, action: "REVERSE", entityType: "JournalEntry", entityId: id, beforeJson: JSON.stringify({ status: "POSTED" }), afterJson: JSON.stringify({ status: "REVERSED", reversalId: reversal.id, reason }) } });
      return reversal;
    });
  }

  async reversePayment(id: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, include: { customerLedger: { include: { reversalEntry: true } }, supplierLedger: { include: { reversalEntry: true } }, cashbookEntries: { include: { reversalEntry: true } }, reversalPayment: true } });
      if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment was not found.");
      if (payment.status !== "POSTED" || payment.reversalPayment) throw new HttpError(409, "PAYMENT_ALREADY_REVERSED", "Payment has already been reversed.");
      const reversedAt = new Date(); if (payment.method === "CASH") await AccountingPostingService.assertCashDayOpen(tx, reversedAt);
      const reversal = await tx.payment.create({ data: { receiptNumber: documentNumber("REV"), direction: payment.direction === "IN" ? "OUT" : "IN", partyType: payment.partyType, customerId: payment.customerId, supplierId: payment.supplierId, saleId: payment.saleId, purchaseId: payment.purchaseId, method: payment.method, bankAccountId: payment.bankAccountId, amountMinor: payment.amountMinor, reference: payment.receiptNumber, notes: reason, paidAt: reversedAt, createdById: userId, reversalOfId: payment.id } });
      for (const entry of payment.customerLedger) if (!entry.reversalEntry) await tx.customerLedger.create({ data: { customerId: entry.customerId, entryType: "REVERSAL", debitMinor: entry.creditMinor, creditMinor: entry.debitMinor, sourceType: "LEDGER_REVERSAL", sourceId: entry.id, reversalOfEntryId: entry.id, notes: reason, occurredAt: reversedAt, createdById: userId } });
      for (const entry of payment.supplierLedger) if (!entry.reversalEntry) await tx.supplierLedger.create({ data: { supplierId: entry.supplierId, entryType: "REVERSAL", debitMinor: entry.creditMinor, creditMinor: entry.debitMinor, sourceType: "SUPPLIER_LEDGER_REVERSAL", sourceId: entry.id, reversalOfEntryId: entry.id, notes: reason, occurredAt: reversedAt, createdById: userId } });
      for (const cash of payment.cashbookEntries) if (!cash.reversalEntry) await tx.cashbookEntry.create({ data: { entryNumber: documentNumber("CASH"), direction: cash.direction === "IN" ? "OUT" : "IN", entryType: "ADJUSTMENT", amountMinor: cash.amountMinor, sourceType: "CASHBOOK", sourceId: cash.id, reversalOfId: cash.id, notes: reason, occurredAt: reversedAt, createdById: userId } });
      const journal = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: "PAYMENT", sourceId: payment.id, postingKey: "PRIMARY" } } }); if (journal) await AccountingPostingService.reverse(tx, journal.id, reason, userId, reversedAt);
      await tx.payment.update({ where: { id }, data: { status: "VOIDED" } }); await tx.auditLog.create({ data: { userId, action: "REVERSE", entityType: "Payment", entityId: id, beforeJson: JSON.stringify({ status: "POSTED" }), afterJson: JSON.stringify({ status: "VOIDED", reversalId: reversal.id, reason }) } }); return reversal;
    });
  }

  async banks() { return this.db.bankAccount.findMany({ where: { deletedAt: null }, include: { glAccount: true }, orderBy: { name: "asc" } }); }

  async createBank(input: BankAccountInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      const glAccount = await tx.account.create({ data: { code: input.glCode, name: `${input.name} Bank`, type: "ASSET", normalBalance: "DEBIT", isSystem: false } });
      const bank = await tx.bankAccount.create({ data: { name: input.name, bankName: input.bankName ?? null, accountNumber: input.accountNumber ?? null, glAccountId: glAccount.id } });
      await tx.auditLog.create({ data: { userId, action: "CREATE", entityType: "BankAccount", entityId: bank.id, afterJson: JSON.stringify(bank) } });
      return bank;
    }).catch((error) => { if (isUniqueConstraintError(error)) throw new HttpError(409, "BANK_OR_ACCOUNT_EXISTS", "The bank or general-ledger code already exists."); throw error; });
  }

  async createFinancialTransaction(input: FinancialTransactionInput, userId: string) {
    const amountMinor = moneyToMinor(String(input.amount)), occurredAt = atNoon(input.occurredOn);
    return this.db.$transaction(async (tx) => {
      const cashId = await AccountingPostingService.accountId(tx, "CASH");
      const bankId = async (id?: string | null) => { if (!id) throw new HttpError(400, "BANK_ACCOUNT_REQUIRED", "Select the required bank account."); const bank = await tx.bankAccount.findFirst({ where: { id, isActive: true, deletedAt: null } }); if (!bank) throw new HttpError(400, "INVALID_BANK_ACCOUNT", "Bank account is unavailable."); return bank.glAccountId; };
      let debitAccountId: string, creditAccountId: string;
      switch (input.type) {
        case "OWNER_INVESTMENT": debitAccountId = input.toBankAccountId ? await bankId(input.toBankAccountId) : cashId; creditAccountId = await AccountingPostingService.accountId(tx, "CAPITAL"); break;
        case "OWNER_WITHDRAWAL": debitAccountId = await AccountingPostingService.accountId(tx, "DRAWINGS"); creditAccountId = input.fromBankAccountId ? await bankId(input.fromBankAccountId) : cashId; break;
        case "CASH_TO_BANK": debitAccountId = await bankId(input.toBankAccountId); creditAccountId = cashId; break;
        case "BANK_TO_CASH": debitAccountId = cashId; creditAccountId = await bankId(input.fromBankAccountId); break;
        case "BANK_TO_BANK": debitAccountId = await bankId(input.toBankAccountId); creditAccountId = await bankId(input.fromBankAccountId); if (debitAccountId === creditAccountId) throw new HttpError(400, "SAME_BANK_ACCOUNT", "Transfer accounts must be different."); break;
        case "OTHER_INCOME": debitAccountId = input.toBankAccountId ? await bankId(input.toBankAccountId) : cashId; creditAccountId = input.offsetAccountId ?? await AccountingPostingService.accountId(tx, "OTHER_INCOME"); break;
        case "OTHER_EXPENSE": debitAccountId = input.offsetAccountId ?? await AccountingPostingService.accountId(tx, "EXPENSE_GENERAL"); creditAccountId = input.fromBankAccountId ? await bankId(input.fromBankAccountId) : cashId; break;
      }
      const affectsCash = debitAccountId === cashId || creditAccountId === cashId;
      if (affectsCash) await AccountingPostingService.assertCashDayOpen(tx, occurredAt);
      const transaction = await tx.financialTransaction.create({ data: { transactionNumber: documentNumber("FT"), type: input.type, amountMinor, fromBankAccountId: input.fromBankAccountId ?? null, toBankAccountId: input.toBankAccountId ?? null, offsetAccountId: input.offsetAccountId ?? null, description: input.description, reference: input.reference ?? null, occurredAt, createdById: userId } });
      await AccountingPostingService.post(tx, { sourceType: "FINANCIAL_TRANSACTION", sourceId: transaction.id, transactionDate: occurredAt, description: input.description, createdById: userId, lines: [{ accountId: debitAccountId, debitMinor: amountMinor }, { accountId: creditAccountId, creditMinor: amountMinor }] });
      if (affectsCash) await tx.cashbookEntry.create({ data: { entryNumber: documentNumber("CASH"), direction: debitAccountId === cashId ? "IN" : "OUT", entryType: cashbookType(input.type), amountMinor, sourceType: "FINANCIAL_TRANSACTION", sourceId: transaction.id, notes: input.description, reference: input.reference ?? transaction.transactionNumber, occurredAt, createdById: userId } });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "FinancialTransaction", entityId: transaction.id, afterJson: JSON.stringify(transaction) } });
      return transaction;
    });
  }

  async generalLedger(accountId: string, filter: FinancialReportFilter) {
    const account = await this.db.account.findUnique({ where: { id: accountId } }); if (!account) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "Account was not found.");
    const before = await this.db.journalLine.aggregate({ where: { accountId, journal: { status: "POSTED", transactionDate: { lt: atNoon(filter.from) } } }, _sum: { debitMinor: true, creditMinor: true } });
    let runningMinor = (before._sum.debitMinor ?? 0) - (before._sum.creditMinor ?? 0);
    const lines = await this.db.journalLine.findMany({ where: { accountId, journal: { status: "POSTED", transactionDate: { gte: atNoon(filter.from), lte: endOfDay(filter.to) } } }, include: { journal: { select: { id: true, entryNumber: true, transactionDate: true, description: true, sourceType: true, sourceId: true } }, customer: { select: { name: true } }, supplier: { select: { name: true } } }, orderBy: [{ journal: { transactionDate: "asc" } }, { lineNumber: "asc" }] });
    return { account, openingBalance: minorToMoney(runningMinor), lines: lines.map((line) => { runningMinor += line.debitMinor - line.creditMinor; return { ...line, debit: minorToMoney(line.debitMinor), credit: minorToMoney(line.creditMinor), runningBalance: minorToMoney(runningMinor) }; }), closingBalance: minorToMoney(runningMinor) };
  }

  async cashInHand(filter: FinancialReportFilter) {
    const account = await this.db.account.findFirst({ where: { systemCode: "CASH", deletedAt: null } });
    if (!account) throw new HttpError(404, "CASH_ACCOUNT_NOT_FOUND", "Cash in hand account was not found.");
    const [before, lines] = await Promise.all([
      this.db.journalLine.aggregate({ where: { accountId: account.id, journal: { status: "POSTED", transactionDate: { lt: atNoon(filter.from) } } }, _sum: { debitMinor: true, creditMinor: true } }),
      this.db.journalLine.findMany({ where: { accountId: account.id, journal: { status: "POSTED", transactionDate: { gte: atNoon(filter.from), lte: endOfDay(filter.to) } } }, include: { journal: { select: { entryNumber: true, transactionDate: true, description: true, sourceType: true, sourceId: true } } }, orderBy: [{ journal: { transactionDate: "asc" } }, { lineNumber: "asc" }] }),
    ]);
    const openingMinor = (before._sum.debitMinor ?? 0) - (before._sum.creditMinor ?? 0); let runningMinor = openingMinor;
    const cashInMinor = lines.reduce((sum, line) => sum + line.debitMinor, 0), cashOutMinor = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    return { from: filter.from, to: filter.to, account, openingBalance: minorToMoney(openingMinor), cashIn: minorToMoney(cashInMinor), cashOut: minorToMoney(cashOutMinor), closingBalance: minorToMoney(openingMinor + cashInMinor - cashOutMinor), rows: lines.map((line) => { runningMinor += line.debitMinor - line.creditMinor; return { id: line.id, date: line.journal.transactionDate.toISOString().slice(0, 10), entryNumber: line.journal.entryNumber, description: line.journal.description, source: line.journal.sourceType, reference: line.journal.sourceId, cashIn: minorToMoney(line.debitMinor), cashOut: minorToMoney(line.creditMinor), balance: minorToMoney(runningMinor) }; }) };
  }

  async trialBalance(filter: FinancialReportFilter) {
    const accounts = await this.db.account.findMany({ where: { deletedAt: null }, include: { journalLines: { where: { journal: { status: "POSTED", transactionDate: { lte: endOfDay(filter.to) } } }, select: { debitMinor: true, creditMinor: true } } }, orderBy: { code: "asc" } });
    const rows = accounts.map((account) => { const net = account.journalLines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0); return { id: account.id, code: account.code, name: account.name, type: account.type, debitMinor: Math.max(0, net), creditMinor: Math.max(0, -net) }; }).filter((row) => row.debitMinor || row.creditMinor);
    const debitMinor = rows.reduce((sum, row) => sum + row.debitMinor, 0), creditMinor = rows.reduce((sum, row) => sum + row.creditMinor, 0);
    return { from: filter.from, to: filter.to, rows: rows.map((row) => ({ ...row, debit: minorToMoney(row.debitMinor), credit: minorToMoney(row.creditMinor) })), totals: { debit: minorToMoney(debitMinor), credit: minorToMoney(creditMinor), balanced: debitMinor === creditMinor } };
  }

  async profitAndLoss(filter: FinancialReportFilter) {
    const rows = await this.accountBalances(filter, ["REVENUE", "CONTRA_REVENUE", "EXPENSE"], false);
    const totals = calculateProfitAndLoss(rows);
    const statement = [
      { section: "Revenue", label: "Sales and operating revenue", amount: minorToMoney(totals.revenueMinor) },
      { section: "Revenue", label: "Less: returns and discounts", amount: minorToMoney(-totals.contraRevenueMinor) },
      { section: "Revenue", label: "Net revenue", amount: minorToMoney(totals.netRevenueMinor) },
      { section: "Gross profit", label: "Less: cost of goods sold", amount: minorToMoney(-totals.costOfGoodsSoldMinor) },
      { section: "Gross profit", label: "Gross profit", amount: minorToMoney(totals.grossProfitMinor) },
      { section: "Operating result", label: "Other income", amount: minorToMoney(totals.otherIncomeMinor) },
      { section: "Operating result", label: "Less: operating expenses", amount: minorToMoney(-totals.operatingExpensesMinor) },
      { section: "Net result", label: "Net profit / loss", amount: minorToMoney(totals.netProfitMinor) },
    ];
    return { from: filter.from, to: filter.to, rows: rows.map(moneyBalance), statement, revenue: minorToMoney(totals.revenueMinor), contraRevenue: minorToMoney(totals.contraRevenueMinor), netRevenue: minorToMoney(totals.netRevenueMinor), costOfGoodsSold: minorToMoney(totals.costOfGoodsSoldMinor), grossProfit: minorToMoney(totals.grossProfitMinor), otherIncome: minorToMoney(totals.otherIncomeMinor), operatingExpenses: minorToMoney(totals.operatingExpensesMinor), expenses: minorToMoney(totals.costOfGoodsSoldMinor + totals.operatingExpensesMinor), netProfit: minorToMoney(totals.netProfitMinor), grossMarginPercent: totals.grossMarginPercent, netMarginPercent: totals.netMarginPercent };
  }

  async balanceSheet(filter: FinancialReportFilter) {
    const rows = await this.accountBalances(filter, ["ASSET", "LIABILITY", "EQUITY"], true);
    const pnl = await this.accountBalances({ ...filter, from: "1900-01-01" }, ["REVENUE", "CONTRA_REVENUE", "EXPENSE"], false);
    const currentEarningsMinor = -pnl.reduce((sum, row) => sum + row.netMinor, 0);
    const assetsMinor = rows.filter((r) => r.type === "ASSET").reduce((s, r) => s + r.netMinor, 0);
    const liabilitiesMinor = -rows.filter((r) => r.type === "LIABILITY").reduce((s, r) => s + r.netMinor, 0);
    const equityMinor = -rows.filter((r) => r.type === "EQUITY").reduce((s, r) => s + r.netMinor, 0) + currentEarningsMinor;
    return { asOf: filter.to, rows: rows.map(moneyBalance), assets: minorToMoney(assetsMinor), liabilities: minorToMoney(liabilitiesMinor), equityBeforeEarnings: minorToMoney(equityMinor - currentEarningsMinor), currentEarnings: minorToMoney(currentEarningsMinor), totalEquity: minorToMoney(equityMinor), balanced: assetsMinor === liabilitiesMinor + equityMinor };
  }

  async cashFlow(filter: FinancialReportFilter) {
    const cash = await this.db.account.findMany({ where: { OR: [{ systemCode: "CASH" }, { bankAccounts: { some: { isActive: true, deletedAt: null } } }] }, select: { id: true } });
    const cashIds = new Set(cash.map((a) => a.id));
    const journals = await this.db.journalEntry.findMany({ where: { status: "POSTED", transactionDate: { gte: atNoon(filter.from), lte: endOfDay(filter.to) }, lines: { some: { accountId: { in: [...cashIds] } } } }, include: { lines: { include: { account: { select: { type: true, systemCode: true } } } } } });
    const totals = { operatingMinor: 0, investingMinor: 0, financingMinor: 0 };
    for (const journal of journals) { const movement = journal.lines.filter((l) => cashIds.has(l.accountId)).reduce((s, l) => s + l.debitMinor - l.creditMinor, 0); if (!movement) continue; const counterpart = journal.lines.find((l) => !cashIds.has(l.accountId)); if (counterpart?.account.systemCode === "CAPITAL" || counterpart?.account.systemCode === "DRAWINGS") totals.financingMinor += movement; else if (counterpart?.account.type === "ASSET" && counterpart.account.systemCode !== "AR") totals.investingMinor += movement; else totals.operatingMinor += movement; }
    return { from: filter.from, to: filter.to, operating: minorToMoney(totals.operatingMinor), investing: minorToMoney(totals.investingMinor), financing: minorToMoney(totals.financingMinor), netCashChange: minorToMoney(totals.operatingMinor + totals.investingMinor + totals.financingMinor) };
  }

  async receivablesPayables(asOf: string) {
    const lines = await this.db.journalLine.findMany({ where: { journal: { status: "POSTED", transactionDate: { lte: endOfDay(asOf) } }, account: { systemCode: { in: ["AR", "AP"] } } }, include: { account: { select: { systemCode: true } }, customer: { select: { id: true, code: true, name: true } }, supplier: { select: { id: true, code: true, name: true } } } });
    const receivables = aggregateParty(lines.filter((l) => l.account.systemCode === "AR"), "customer");
    const payables = aggregateParty(lines.filter((l) => l.account.systemCode === "AP"), "supplier").map((r) => ({ ...r, balanceMinor: -r.balanceMinor, balance: minorToMoney(-r.balanceMinor) }));
    return { asOf, receivables, payables };
  }

  async cutover(input: AccountingCutoverInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      if (await tx.journalEntry.count()) throw new HttpError(409, "ACCOUNTING_ALREADY_STARTED", "Cutover is only available before the first journal is posted.");
      const date = atNoon(input.cutoverDate), [products, customers, suppliers, cash, payments, expenses] = await Promise.all([
        tx.product.findMany({ where: { deletedAt: null, stockOnHandBaseQty: { gt: 0 } }, select: { id: true, stockOnHandBaseQty: true, purchasePriceMinor: true } }),
        tx.customer.findMany({ where: { deletedAt: null }, select: { id: true, ledgerEntries: { select: { debitMinor: true, creditMinor: true } } } }),
        tx.supplier.findMany({ where: { deletedAt: null }, select: { id: true, ledgerEntries: { select: { debitMinor: true, creditMinor: true } } } }),
        tx.cashbookEntry.findMany({ select: { direction: true, amountMinor: true } }),
        tx.payment.findMany({ where: { status: "POSTED", method: { not: "CASH" } }, select: { direction: true, amountMinor: true } }),
        tx.expense.findMany({ where: { status: "POSTED", method: { not: "CASH" } }, select: { amountMinor: true } }),
      ]);
      const lines: PostingLine[] = [];
      const cashMinor = cash.reduce((sum, row) => sum + (row.direction === "IN" ? row.amountMinor : -row.amountMinor), 0); if (cashMinor > 0) lines.push({ systemCode: "CASH", debitMinor: cashMinor }); else if (cashMinor < 0) lines.push({ systemCode: "CASH", creditMinor: -cashMinor });
      const bankMinor = payments.reduce((sum, row) => sum + (row.direction === "IN" ? row.amountMinor : -row.amountMinor), 0) - expenses.reduce((sum, row) => sum + row.amountMinor, 0); if (bankMinor > 0) lines.push({ systemCode: "BANK_CLEARING", debitMinor: bankMinor }); else if (bankMinor < 0) lines.push({ systemCode: "BANK_CLEARING", creditMinor: -bankMinor });
      for (const customer of customers) { const balance = customer.ledgerEntries.reduce((sum, row) => sum + row.debitMinor - row.creditMinor, 0); if (balance > 0) lines.push({ systemCode: "AR", debitMinor: balance, customerId: customer.id }); else if (balance < 0) lines.push({ systemCode: "AR", creditMinor: -balance, customerId: customer.id }); }
      for (const supplier of suppliers) { const balance = supplier.ledgerEntries.reduce((sum, row) => sum + row.creditMinor - row.debitMinor, 0); if (balance > 0) lines.push({ systemCode: "AP", creditMinor: balance, supplierId: supplier.id }); else if (balance < 0) lines.push({ systemCode: "AP", debitMinor: -balance, supplierId: supplier.id }); }
      for (const product of products) { const valueMinor = product.stockOnHandBaseQty * product.purchasePriceMinor; await tx.product.update({ where: { id: product.id }, data: { averageCostMinor: product.purchasePriceMinor, inventoryValueMinor: valueMinor } }); if (valueMinor) lines.push({ systemCode: "INVENTORY", debitMinor: valueMinor, productId: product.id }); }
      const debit = lines.reduce((sum, row) => sum + (row.debitMinor ?? 0), 0), credit = lines.reduce((sum, row) => sum + (row.creditMinor ?? 0), 0); if (debit > credit) lines.push({ systemCode: "OPENING_EQUITY", creditMinor: debit - credit, memo: input.note }); else if (credit > debit) lines.push({ systemCode: "OPENING_EQUITY", debitMinor: credit - debit, memo: input.note });
      if (lines.length < 2) throw new HttpError(409, "NOTHING_TO_CUTOVER", "No existing balances were found for accounting cutover.");
      const journal = await AccountingPostingService.post(tx, { sourceType: "MANUAL_ADJUSTMENT", sourceId: "ACCOUNTING-CUTOVER", postingKey: "CUTOVER", transactionDate: date, description: input.note, createdById: userId, lines });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "AccountingCutover", entityId: journal.id, afterJson: JSON.stringify({ cutoverDate: input.cutoverDate, totalMinor: journal.totalDebitMinor }) } }); return journal;
    });
  }

  private async accountBalances(filter: FinancialReportFilter, types: Array<"ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "CONTRA_REVENUE" | "EXPENSE">, cumulative: boolean) {
    const accounts = await this.db.account.findMany({ where: { type: { in: types }, deletedAt: null }, include: { journalLines: { where: { journal: { status: "POSTED", transactionDate: { ...(cumulative ? {} : { gte: atNoon(filter.from) }), lte: endOfDay(filter.to) } } }, select: { debitMinor: true, creditMinor: true } } }, orderBy: { code: "asc" } });
    return accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, systemCode: a.systemCode, netMinor: a.journalLines.reduce((s, l) => s + l.debitMinor - l.creditMinor, 0) })).filter((a) => a.netMinor !== 0);
  }
}

function journalDto(row: any) {
  return {
    ...row,
    totalDebit: minorToMoney(row.totalDebitMinor),
    totalCredit: minorToMoney(row.totalCreditMinor),
    lines: row.lines.map((line: any) => ({
      ...line,
      debit: minorToMoney(line.debitMinor),
      credit: minorToMoney(line.creditMinor),
    })),
  };
}
function moneyBalance<T extends { netMinor: number }>(row: T) { return { ...row, balance: minorToMoney(Math.abs(row.netMinor)), side: row.netMinor >= 0 ? "DEBIT" : "CREDIT" }; }
export function calculateProfitAndLoss(rows: Array<{ type: string; systemCode: string | null; netMinor: number }>) { const revenueMinor = rows.filter((row) => row.type === "REVENUE" && row.systemCode !== "OTHER_INCOME").reduce((sum, row) => sum - row.netMinor, 0); const otherIncomeMinor = rows.filter((row) => row.type === "REVENUE" && row.systemCode === "OTHER_INCOME").reduce((sum, row) => sum - row.netMinor, 0); const contraRevenueMinor = rows.filter((row) => row.type === "CONTRA_REVENUE").reduce((sum, row) => sum + row.netMinor, 0); const costOfGoodsSoldMinor = rows.filter((row) => row.type === "EXPENSE" && row.systemCode === "COGS").reduce((sum, row) => sum + row.netMinor, 0); const operatingExpensesMinor = rows.filter((row) => row.type === "EXPENSE" && row.systemCode !== "COGS").reduce((sum, row) => sum + row.netMinor, 0); const netRevenueMinor = revenueMinor - contraRevenueMinor, grossProfitMinor = netRevenueMinor - costOfGoodsSoldMinor, netProfitMinor = grossProfitMinor + otherIncomeMinor - operatingExpensesMinor; return { revenueMinor, otherIncomeMinor, contraRevenueMinor, netRevenueMinor, costOfGoodsSoldMinor, grossProfitMinor, operatingExpensesMinor, netProfitMinor, grossMarginPercent: netRevenueMinor ? Number((grossProfitMinor / netRevenueMinor * 100).toFixed(2)) : 0, netMarginPercent: netRevenueMinor ? Number((netProfitMinor / netRevenueMinor * 100).toFixed(2)) : 0 }; }
function cashbookType(type: FinancialTransactionInput["type"]) { if (type === "OWNER_INVESTMENT") return "OWNER_INVESTMENT" as const; if (type === "OWNER_WITHDRAWAL") return "OWNER_WITHDRAWAL" as const; if (type === "CASH_TO_BANK") return "CASH_DEPOSIT" as const; if (type === "BANK_TO_CASH") return "CASH_WITHDRAWAL" as const; if (type === "OTHER_INCOME") return "OTHER_INCOME" as const; if (type === "OTHER_EXPENSE") return "OTHER_EXPENSE" as const; return "ADJUSTMENT" as const; }
function aggregateParty(lines: Array<{ debitMinor: number; creditMinor: number; customer: { id: string; code: string; name: string } | null; supplier: { id: string; code: string; name: string } | null }>, key: "customer" | "supplier") { const map = new Map<string, { id: string; code: string; name: string; balanceMinor: number }>(); for (const line of lines) { const party = line[key]; if (!party) continue; const row = map.get(party.id) ?? { ...party, balanceMinor: 0 }; row.balanceMinor += line.debitMinor - line.creditMinor; map.set(party.id, row); } return [...map.values()].filter((r) => r.balanceMinor !== 0).map((r) => ({ ...r, balance: minorToMoney(r.balanceMinor) })).sort((a, b) => Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor)); }
