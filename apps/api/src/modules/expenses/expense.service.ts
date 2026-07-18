import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateExpenseCategoryInput, CreateExpenseInput, ExpenseListQuery, UpdateExpenseCategoryInput, VoidExpenseInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { pakistanDay } from "../cashbook/cashbook.service.js";
import { moneyToMinor, minorToMoney } from "../products/product.service.js";
import { AccountingPostingService } from "../accounting/posting.service.js";

const DEFAULT_CATEGORIES = ["Freight", "Loading & Unloading", "Food & Refreshments", "Utilities", "Rent", "Salary & Wages", "Vehicle & Fuel", "Repairs & Maintenance", "Office Supplies", "Other"];
const documentNumber = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
function pakistanToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
const expenseInclude = {
  expenseCategory: { select: { id: true, name: true, isActive: true } },
  createdBy: { select: { id: true, displayName: true, username: true } },
  voidedBy: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.ExpenseInclude;
type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

export class ExpenseService {
  constructor(private readonly db: PrismaClient) {}

  private async ensureDefaultCategories() {
    await Promise.all(DEFAULT_CATEGORIES.map((name) => this.db.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    })));
  }

  async categories(includeInactive = false) {
    await this.ensureDefaultCategories();
    return this.db.expenseCategory.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      select: { id: true, name: true, isActive: true, _count: { select: { expenses: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async createCategory(input: CreateExpenseCategoryInput, userId: string) {
    const existing = await this.db.expenseCategory.findFirst({ where: { name: { equals: input.name } } });
    if (existing) throw new HttpError(409, "EXPENSE_CATEGORY_EXISTS", "An expense category with this name already exists.");
    return this.db.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({ data: { name: input.name } });
      await tx.auditLog.create({ data: { userId, action: "CREATE", entityType: "ExpenseCategory", entityId: category.id, afterJson: JSON.stringify(category) } });
      return category;
    });
  }

  async updateCategory(id: string, input: UpdateExpenseCategoryInput, userId: string) {
    const current = await this.db.expenseCategory.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new HttpError(404, "EXPENSE_CATEGORY_NOT_FOUND", "Expense category was not found.");
    if (input.name && input.name !== current.name && await this.db.expenseCategory.findFirst({ where: { name: { equals: input.name }, id: { not: id } } })) {
      throw new HttpError(409, "EXPENSE_CATEGORY_EXISTS", "An expense category with this name already exists.");
    }
    return this.db.$transaction(async (tx) => {
      const data: Prisma.ExpenseCategoryUpdateInput = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      };
      const category = await tx.expenseCategory.update({ where: { id }, data });
      await tx.auditLog.create({ data: { userId, action: input.isActive === false ? "DEACTIVATE" : input.isActive === true ? "ACTIVATE" : "UPDATE", entityType: "ExpenseCategory", entityId: id, beforeJson: JSON.stringify(current), afterJson: JSON.stringify(category) } });
      return category;
    });
  }

  async list(query: ExpenseListQuery) {
    const dateRange = { gte: pakistanDay(query.from).start, lte: pakistanDay(query.to).end };
    const where: Prisma.ExpenseWhereInput = {
      incurredAt: dateRange,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.paymentMethod ? { method: query.paymentMethod } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { voucherNumber: { contains: query.search } },
        { description: { contains: query.search } },
        { reference: { contains: query.search } },
        { category: { contains: query.search } },
      ] } : {}),
    };
    const expenses = await this.db.expense.findMany({ where, include: expenseInclude, orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }] });
    const posted = expenses.filter((expense) => expense.status === "POSTED");
    const totalMinor = posted.reduce((total, expense) => total + expense.amountMinor, 0);
    const cashMinor = posted.filter((expense) => expense.method === "CASH").reduce((total, expense) => total + expense.amountMinor, 0);
    return {
      expenses: expenses.map(expenseDto),
      summary: { count: posted.length, total: minorToMoney(totalMinor), cashPaid: minorToMoney(cashMinor), nonCashPaid: minorToMoney(totalMinor - cashMinor) },
    };
  }

  async create(input: CreateExpenseInput, userId: string) {
    const amountMinor = moneyToMinor(input.amount);
    const day = pakistanDay(input.incurredOn);
    return this.db.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findFirst({ where: { id: input.categoryId, isActive: true, deletedAt: null } });
      if (!category) throw new HttpError(400, "INVALID_EXPENSE_CATEGORY", "Select an active expense category.");
      if (input.paymentMethod === "CASH" && await tx.dailyClosing.findUnique({ where: { businessDate: day.businessDate } })) {
        throw new HttpError(409, "DAY_ALREADY_CLOSED", "A cash expense cannot be posted after this business day is closed.");
      }
      const expense = await tx.expense.create({
        data: {
          voucherNumber: documentNumber("EXP"), category: category.name, categoryId: category.id,
          description: input.description, amountMinor, method: input.paymentMethod,
          reference: input.reference || null, incurredAt: day.businessDate, createdById: userId,
        },
        include: expenseInclude,
      });
      if (input.paymentMethod === "CASH") {
        await tx.cashbookEntry.create({ data: {
          entryNumber: documentNumber("CASH"), direction: "OUT", entryType: "EXPENSE", amountMinor,
          expenseId: expense.id, sourceType: "EXPENSE", sourceId: expense.id,
          reference: input.reference || expense.voucherNumber, notes: `${category.name}: ${input.description}`,
          occurredAt: day.businessDate, createdById: userId,
        } });
      }
      const expenseAccountId = category.accountId ?? await AccountingPostingService.accountId(tx, "EXPENSE_GENERAL");
      const tenderAccountId = await AccountingPostingService.tenderAccountId(tx, input.paymentMethod, expense.bankAccountId);
      await AccountingPostingService.post(tx, { sourceType: "EXPENSE", sourceId: expense.id, transactionDate: expense.incurredAt, description: `${category.name}: ${input.description}`, createdById: userId, lines: [{ accountId: expenseAccountId, debitMinor: amountMinor }, { accountId: tenderAccountId, creditMinor: amountMinor }] });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "Expense", entityId: expense.id, afterJson: JSON.stringify({ voucherNumber: expense.voucherNumber, category: category.name, amountMinor, method: input.paymentMethod, incurredOn: input.incurredOn }) } });
      return expenseDto(expense);
    });
  }

  async void(id: string, input: VoidExpenseInput, userId: string) {
    const current = await this.db.expense.findUnique({ where: { id }, include: expenseInclude });
    if (!current) throw new HttpError(404, "EXPENSE_NOT_FOUND", "Expense was not found.");
    if (current.status !== "POSTED") throw new HttpError(409, "EXPENSE_ALREADY_VOIDED", "This expense has already been cancelled.");
    const today = pakistanToday();
    const day = pakistanDay(today);
    return this.db.$transaction(async (tx) => {
      if (current.method === "CASH" && await tx.dailyClosing.findUnique({ where: { businessDate: day.businessDate } })) {
        throw new HttpError(409, "DAY_ALREADY_CLOSED", "This cash expense cannot be reversed after today's cashbook is closed.");
      }
      const expense = await tx.expense.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidedById: userId, voidReason: input.reason }, include: expenseInclude });
      if (current.method === "CASH") {
        await tx.cashbookEntry.create({ data: {
          entryNumber: documentNumber("CASH"), direction: "IN", entryType: "ADJUSTMENT", amountMinor: current.amountMinor,
          expenseId: current.id, sourceType: "EXPENSE", sourceId: current.id,
          reference: current.voucherNumber, notes: `Expense cancellation: ${input.reason}`,
          occurredAt: day.businessDate, createdById: userId,
        } });
      }
      const journal = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: "EXPENSE", sourceId: current.id, postingKey: "PRIMARY" } } });
      if (journal) await AccountingPostingService.reverse(tx, journal.id, input.reason, userId);
      await tx.auditLog.create({ data: { userId, action: "VOID", entityType: "Expense", entityId: id, beforeJson: JSON.stringify({ status: current.status }), afterJson: JSON.stringify({ status: "VOIDED", reason: input.reason }) } });
      return expenseDto(expense);
    });
  }
}

function expenseDto(expense: ExpenseRecord) {
  return {
    ...expense,
    amount: minorToMoney(expense.amountMinor),
    category: expense.expenseCategory?.name ?? expense.category,
  };
}
