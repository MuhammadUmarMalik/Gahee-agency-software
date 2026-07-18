import { z } from "zod";
import { cashbookDateSchema } from "./cashbook.js";

export const EXPENSE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;
const expenseMoneySchema = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid amount.").refine((value) => Number(value) > 0, "Amount must be greater than zero.");

export const createExpenseCategoryInputSchema = z.object({
  name: z.string().trim().min(2, "Category name is required.").max(60),
});

export const updateExpenseCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
}).refine((input) => Object.keys(input).length > 0, "At least one change is required.");

export const createExpenseInputSchema = z.object({
  categoryId: z.string().cuid("Select an expense category."),
  amount: expenseMoneySchema,
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  incurredOn: cashbookDateSchema,
  description: z.string().trim().min(3, "Enter a short expense description.").max(300),
  reference: z.string().trim().max(120).optional(),
});

export const expenseListQuerySchema = z.object({
  from: cashbookDateSchema,
  to: cashbookDateSchema,
  categoryId: z.string().cuid().optional(),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
  status: z.enum(["POSTED", "VOIDED"]).optional(),
  search: z.string().trim().max(100).optional(),
}).refine((input) => input.from <= input.to, { path: ["to"], message: "End date cannot be before start date." });

export const voidExpenseInputSchema = z.object({
  reason: z.string().trim().min(5, "Explain why this expense is being cancelled.").max(300),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategoryInputSchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategoryInputSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type VoidExpenseInput = z.infer<typeof voidExpenseInputSchema>;
