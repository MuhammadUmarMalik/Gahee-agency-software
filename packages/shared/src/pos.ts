import { z } from "zod";
import { moneyInputSchema, PAYMENT_METHODS } from "./purchase.js";

export const posSearchQuerySchema = z.object({ search: z.string().trim().max(100).default(""), categoryId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) });
export const posCartItemSchema = z.object({ productId: z.string().min(1), unit: z.enum(["PACK", "BASE"]), quantity: z.number().int().positive().max(1_000_000) });
export const posPaymentSchema = z.object({ method: z.enum(PAYMENT_METHODS), amount: moneyInputSchema, reference: z.string().trim().max(100).optional() });
export const checkoutInputSchema = z.object({
  customerId: z.string().min(1).nullable(), saleType: z.enum(["RETAIL", "WHOLESALE"]),
  items: z.array(posCartItemSchema).min(1).max(200), discountBps: z.number().int().min(0).max(10_000),
  approvalToken: z.string().min(1).optional(), payments: z.array(posPaymentSchema).max(10), notes: z.string().trim().max(1000).optional(),
});
export const holdSaleInputSchema = z.object({ label: z.string().trim().min(1).max(80), cart: z.record(z.unknown()) });
export const saleIdSchema = z.string().min(1);

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type HoldSaleInput = z.infer<typeof holdSaleInputSchema>;
export type PosPaymentInput = z.infer<typeof posPaymentSchema>;

export interface PosProduct {
  id: string; name: string; sku: string; barcode: string | null; categoryId: string | null; categoryName: string | null;
  baseUnit: string; packUnit: string; unitsPerPack: number; retailPrice: string; wholesalePrice: string;
  taxRateBps: number; stockBaseQty: number; availableBaseQty: number; expiredBaseQty: number;
  suggestedBatch: { id: string; batchNumber: string; expiryDate: string | null; stockBaseQty: number } | null;
}
export interface PosOptions { categories: Array<{ id: string; name: string }>; customers: Array<{ id: string; code: string; name: string; phone: string | null; balance: string }> }
