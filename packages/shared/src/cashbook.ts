import { z } from "zod";

export const CASHBOOK_ENTRY_TYPES = ["OPENING_CASH", "CASH_SALE", "CUSTOMER_RECOVERY", "SUPPLIER_PAYMENT", "EXPENSE", "CASH_DEPOSIT", "CASH_WITHDRAWAL", "OWNER_INVESTMENT", "OWNER_WITHDRAWAL", "OTHER_INCOME", "OTHER_EXPENSE", "CLOSING_ADJUSTMENT"] as const;
export const MANUAL_CASHBOOK_ENTRY_TYPES = ["OPENING_CASH", "CASH_DEPOSIT", "CASH_WITHDRAWAL", "OWNER_INVESTMENT", "OWNER_WITHDRAWAL", "OTHER_INCOME", "OTHER_EXPENSE", "CLOSING_ADJUSTMENT"] as const;
export const cashbookDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const money = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid positive amount.");

export const cashbookReportQuerySchema = z.object({
  from: cashbookDateSchema,
  to: cashbookDateSchema,
  userId: z.string().cuid().optional(),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]).optional(),
}).refine((value) => value.from <= value.to, { path: ["to"], message: "End date cannot be before start date." });

export const createCashbookEntryInputSchema = z.object({
  entryType: z.enum(MANUAL_CASHBOOK_ENTRY_TYPES),
  direction: z.enum(["IN", "OUT"]),
  amount: money,
  occurredOn: cashbookDateSchema,
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().min(3).max(500),
}).superRefine((value, ctx) => {
  const fixed: Partial<Record<(typeof MANUAL_CASHBOOK_ENTRY_TYPES)[number], "IN" | "OUT">> = {
    OPENING_CASH: "IN", CASH_DEPOSIT: "OUT", CASH_WITHDRAWAL: "IN", OWNER_INVESTMENT: "IN", OWNER_WITHDRAWAL: "OUT", OTHER_INCOME: "IN", OTHER_EXPENSE: "OUT",
  };
  if (fixed[value.entryType] && fixed[value.entryType] !== value.direction) ctx.addIssue({ code: "custom", path: ["direction"], message: `${value.entryType.replaceAll("_", " ")} must be a cash ${fixed[value.entryType] === "IN" ? "inflow" : "outflow"}.` });
});

export const dailyClosingInputSchema = z.object({
  businessDate: cashbookDateSchema,
  countedCash: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid amount."),
  notes: z.string().trim().max(500).optional(),
});

export type CashbookReportQuery = z.infer<typeof cashbookReportQuerySchema>;
export type CreateCashbookEntryInput = z.infer<typeof createCashbookEntryInputSchema>;
export type DailyClosingInput = z.infer<typeof dailyClosingInputSchema>;
