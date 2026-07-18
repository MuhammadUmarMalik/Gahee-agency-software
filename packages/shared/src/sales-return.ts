import { z } from "zod";

export const RETURN_CONDITIONS = ["RESALABLE", "DAMAGED", "EXPIRED", "OPENED"] as const;
export const REFUND_METHODS = ["CASH", "CUSTOMER_LEDGER"] as const;

export const salesReturnSearchSchema = z.object({
  invoice: z.string().trim().min(1).max(80),
});

export const salesReturnIdSchema = z.string().cuid();

const returnItemSchema = z.object({
  saleItemId: z.string().cuid(),
  quantityBase: z.number().int().positive().max(2_000_000_000),
  condition: z.enum(RETURN_CONDITIONS),
});

const replacementItemSchema = z.object({
  productId: z.string().cuid(),
  unit: z.enum(["PACK", "BASE"]),
  quantity: z.number().int().positive().max(2_000_000_000),
});

export const createSalesReturnInputSchema = z.object({
  saleId: z.string().cuid(),
  reason: z.string().trim().min(3).max(500),
  refundMethod: z.enum(REFUND_METHODS),
  items: z.array(returnItemSchema).min(1).max(100),
  replacementItems: z.array(replacementItemSchema).max(100),
}).superRefine((value, ctx) => {
  const keys = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.saleItemId}:${item.condition}`;
    if (keys.has(key)) ctx.addIssue({ code: "custom", path: ["items", index], message: "Combine duplicate item and condition rows." });
    keys.add(key);
  });
});

export type CreateSalesReturnInput = z.infer<typeof createSalesReturnInputSchema>;
