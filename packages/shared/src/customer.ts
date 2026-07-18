import { z } from "zod";
import { moneyInputSchema, PAYMENT_METHODS } from "./purchase.js";

export const CUSTOMER_TYPES = ["RETAILER", "WHOLESALER", "DISTRIBUTOR", "OTHER"] as const;
export const signedMoneyInputSchema = z.string().trim().regex(/^-?\d{1,9}(\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places.");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const customerFields = z.object({
  name: z.string().trim().min(2).max(100), businessName: optionalText(150), phone: optionalText(30), whatsapp: optionalText(30),
  address: optionalText(500), taxIdentifier: optionalText(50), customerType: z.enum(CUSTOMER_TYPES),
  paymentTermsDays: z.number().int().min(0).max(3650), isActive: z.boolean(),
});
export const createCustomerInputSchema = customerFields.extend({ openingBalance: signedMoneyInputSchema });
export const updateCustomerInputSchema = customerFields;
export const customerListQuerySchema = z.object({ search: z.string().trim().max(100).default(""), active: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ACTIVE"), customerType: z.enum(CUSTOMER_TYPES).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) });
export const manualLedgerInputSchema = z.object({ direction: z.enum(["DEBIT", "CREDIT"]), amount: moneyInputSchema, reason: z.string().trim().min(3).max(500), dueDate: z.string().date().nullable().optional(), occurredAt: z.string().date(), offsetAccountId: z.string().cuid().optional() });
export const reverseLedgerInputSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const customerPaymentInputSchema = z.object({ amount: moneyInputSchema, method: z.enum(PAYMENT_METHODS), paidAt: z.string().date(), reference: optionalText(100), notes: optionalText(500) });
export const statementQuerySchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
export const customerIdSchema = z.string().min(1);

export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type ManualLedgerInput = z.infer<typeof manualLedgerInputSchema>;
export type CustomerPaymentInput = z.infer<typeof customerPaymentInputSchema>;
