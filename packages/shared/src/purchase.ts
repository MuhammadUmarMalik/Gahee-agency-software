import { z } from "zod";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;
export const moneyInputSchema = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid non-negative amount with up to two decimal places.");
const optionalDate = z.string().date().nullable().optional();

export const purchaseItemInputSchema = z.object({
  productId: z.string().min(1),
  batchId: z.string().min(1).nullable().optional(),
  batchNumber: z.string().trim().max(80).default(""),
  manufacturingDate: optionalDate,
  expiryDate: optionalDate,
  cartonQuantity: z.number().int().min(0).max(10_000_000),
  pieceQuantity: z.number().int().min(0).max(2_000_000_000),
  purchaseRate: moneyInputSchema,
}).refine((value) => value.cartonQuantity > 0 || value.pieceQuantity > 0, { message: "Quantity must be greater than zero." })
  .refine((value) => !value.manufacturingDate || !value.expiryDate || value.expiryDate > value.manufacturingDate, { message: "Expiry date must be after manufacturing date.", path: ["expiryDate"] });

export const createPurchaseInputSchema = z.object({
  supplierId: z.string().min(1),
  supplierInvoice: z.string().trim().min(1).max(100),
  purchaseDate: z.string().date(), dueDate: z.string().date(),
  discount: moneyInputSchema, tax: moneyInputSchema,
  transportExpense: moneyInputSchema, loadingExpense: moneyInputSchema, otherExpense: moneyInputSchema,
  paidAmount: moneyInputSchema, paymentMethod: z.enum(PAYMENT_METHODS),
  paymentReference: z.string().trim().max(100).optional(), notes: z.string().trim().max(1000).optional(),
  items: z.array(purchaseItemInputSchema).min(1).max(200),
}).refine((value) => value.dueDate >= value.purchaseDate, { message: "Due date cannot be before purchase date.", path: ["dueDate"] });

export const purchasePaymentInputSchema = z.object({
  amount: moneyInputSchema,
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().date(), reference: z.string().trim().max(100).optional(), notes: z.string().trim().max(500).optional(),
});

export const purchaseListQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), supplierId: z.string().optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseInputSchema>;
export type PurchasePaymentInput = z.infer<typeof purchasePaymentInputSchema>;
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;

export interface PurchaseProductOption {
  id: string; name: string; sku: string; purchasePrice: string; baseUnit: string; packUnit: string; unitsPerPack: number;
  batches: Array<{ id: string; batchNumber: string; manufacturingDate: string | null; expiryDate: string | null }>;
}
export interface PurchaseSupplierOption { id: string; code: string; name: string; phone: string | null }
