import { z } from "zod";

export const INVENTORY_MOVEMENT_TYPES = ["OPENING_STOCK", "PURCHASE", "SALE", "SALES_RETURN", "PURCHASE_RETURN", "DAMAGE", "EXPIRY", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "CARTON_OPEN"] as const;
export type InventoryMovementType = typeof INVENTORY_MOVEMENT_TYPES[number];

const quantitySchema = z.number().int().min(0).max(2_000_000_000);
export const inventoryAdjustmentSchema = z.object({
  productId: z.string().min(1), batchId: z.string().min(1).nullable().optional(),
  movementType: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  packQuantity: quantitySchema.default(0), baseQuantity: quantitySchema.default(0),
  reason: z.string().trim().min(3).max(500),
}).refine((v) => v.packQuantity > 0 || v.baseQuantity > 0, "Quantity must be greater than zero.");

export const inventoryWriteOffSchema = z.object({
  productId: z.string().min(1), batchId: z.string().min(1).nullable().optional(),
  type: z.enum(["DAMAGE", "EXPIRY", "LEAKED", "MISSING"]), packQuantity: quantitySchema.default(0),
  baseQuantity: quantitySchema.default(0), reason: z.string().trim().min(3).max(500),
}).refine((v) => v.packQuantity > 0 || v.baseQuantity > 0, "Quantity must be greater than zero.");

export const cartonOpenSchema = z.object({
  productId: z.string().min(1), cartons: z.number().int().positive().max(1_000_000),
  notes: z.string().trim().max(500).optional(),
});

export const stockCountSchema = z.object({
  notes: z.string().trim().max(500).optional(),
  lines: z.array(z.object({
    productId: z.string().min(1), batchId: z.string().min(1).nullable().optional(),
    countedPackQuantity: quantitySchema.default(0), countedBaseQuantity: quantitySchema.default(0),
  })).min(1).max(500),
});

export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;
export type InventoryWriteOffInput = z.infer<typeof inventoryWriteOffSchema>;
export type CartonOpenInput = z.infer<typeof cartonOpenSchema>;
export type StockCountInput = z.infer<typeof stockCountSchema>;

export interface InventoryBatchDto { id: string; batchNumber: string; expiryDate: string | null; stockBaseQty: number; availableBaseQty: number; isExpired: boolean }
export interface InventoryStockDto {
  productId: string; name: string; sku: string; barcode: string | null; baseUnit: string; unitsPerPack: number;
  currentBaseQty: number; availableBaseQty: number; damagedBaseQty: number; expiredBaseQty: number;
  expiredWrittenOffBaseQty: number; returnedBaseQty: number; openingBaseQty: number;
  reorderLevelBaseQty: number; isLowStock: boolean; batches: InventoryBatchDto[];
}
export interface InventoryOptionDto { id: string; name: string; sku: string; baseUnit: string; unitsPerPack: number; stockBaseQty: number; unbatchedStockBaseQty: number; batches: InventoryBatchDto[] }
