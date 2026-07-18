import { z } from "zod";

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "CONTRA_REVENUE", "EXPENSE"] as const;
export const PERIOD_STATUSES = ["OPEN", "CLOSED", "LOCKED"] as const;
export const FINANCIAL_TRANSACTION_TYPES = ["OWNER_INVESTMENT", "OWNER_WITHDRAWAL", "CASH_TO_BANK", "BANK_TO_CASH", "BANK_TO_BANK", "OTHER_INCOME", "OTHER_EXPENSE"] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const moneySchema = z.number().finite().positive().max(21_474_836.47);

export const accountInputSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9.-]+$/),
  name: z.string().trim().min(2).max(100),
  type: z.enum(ACCOUNT_TYPES),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().cuid().nullable().optional(),
  allowManual: z.boolean().default(false),
});
export type AccountInput = z.infer<typeof accountInputSchema>;

export const accountUpdateSchema = accountInputSchema.partial().extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

export const financialPeriodInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  startDate: dateSchema,
  endDate: dateSchema,
}).refine((value) => value.startDate <= value.endDate, { path: ["endDate"], message: "End date must be on or after start date." });
export type FinancialPeriodInput = z.infer<typeof financialPeriodInputSchema>;

export const closePeriodSchema = z.object({ action: z.enum(["CLOSE", "REOPEN", "LOCK"]) });
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;

const journalLineSchema = z.object({
  accountId: z.string().cuid(),
  debit: z.number().finite().min(0).max(21_474_836.47).default(0),
  credit: z.number().finite().min(0).max(21_474_836.47).default(0),
  customerId: z.string().cuid().nullable().optional(),
  supplierId: z.string().cuid().nullable().optional(),
  productId: z.string().cuid().nullable().optional(),
  memo: z.string().trim().max(250).nullable().optional(),
}).refine((line) => (line.debit > 0) !== (line.credit > 0), "Enter either a debit or a credit.");

export const manualJournalInputSchema = z.object({
  transactionDate: dateSchema,
  description: z.string().trim().min(3).max(250),
  reference: z.string().trim().min(1).max(100),
  lines: z.array(journalLineSchema).min(2).max(100),
});
export type ManualJournalInput = z.infer<typeof manualJournalInputSchema>;

export const journalFilterSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  accountId: z.string().cuid().optional(),
  status: z.enum(["POSTED", "REVERSED"]).optional(),
  search: z.string().trim().max(100).optional(),
}).refine((value) => value.from <= value.to, { path: ["to"], message: "End date must be on or after start date." });
export type JournalFilter = z.infer<typeof journalFilterSchema>;

export const reversalInputSchema = z.object({ reason: z.string().trim().min(5).max(250) });
export type ReversalInput = z.infer<typeof reversalInputSchema>;

export const financialTransactionInputSchema = z.object({
  type: z.enum(FINANCIAL_TRANSACTION_TYPES),
  amount: moneySchema,
  occurredOn: dateSchema,
  fromBankAccountId: z.string().cuid().nullable().optional(),
  toBankAccountId: z.string().cuid().nullable().optional(),
  offsetAccountId: z.string().cuid().nullable().optional(),
  description: z.string().trim().min(3).max(250),
  reference: z.string().trim().max(100).nullable().optional(),
});
export type FinancialTransactionInput = z.infer<typeof financialTransactionInputSchema>;

export const bankAccountInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  bankName: z.string().trim().max(100).nullable().optional(),
  accountNumber: z.string().trim().max(50).nullable().optional(),
  glCode: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9.-]+$/),
});
export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

export const purchaseReturnInputSchema = z.object({
  purchaseId: z.string().cuid(),
  returnedOn: dateSchema,
  method: z.enum(["CASH", "SUPPLIER_LEDGER"]),
  reason: z.string().trim().min(3).max(250),
  items: z.array(z.object({ purchaseItemId: z.string().cuid(), quantityBase: z.number().int().positive() })).min(1),
});
export type PurchaseReturnInput = z.infer<typeof purchaseReturnInputSchema>;

export const financialReportFilterSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  comparativeFrom: dateSchema.optional(),
  comparativeTo: dateSchema.optional(),
}).refine((value) => value.from <= value.to, { path: ["to"], message: "End date must be on or after start date." });
export type FinancialReportFilter = z.infer<typeof financialReportFilterSchema>;

export const accountingCutoverSchema = z.object({ cutoverDate: dateSchema, note: z.string().trim().min(5).max(250) });
export type AccountingCutoverInput = z.infer<typeof accountingCutoverSchema>;
