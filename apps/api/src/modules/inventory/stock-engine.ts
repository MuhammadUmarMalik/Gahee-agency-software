import type { Prisma, SourceType, StockMovementType } from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";

export type TransactionClient = Prisma.TransactionClient;
const POSITIVE = new Set<StockMovementType>(["OPENING_STOCK", "PURCHASE", "SALES_RETURN", "ADJUSTMENT_IN"]);
const NEGATIVE = new Set<StockMovementType>(["SALE", "PURCHASE_RETURN", "DAMAGE", "EXPIRY", "ADJUSTMENT_OUT", "REPLACEMENT_OUT"]);

export function toBaseQuantity(packQuantity: number, baseQuantity: number, unitsPerPack: number): number {
  for (const value of [packQuantity, baseQuantity]) if (!Number.isSafeInteger(value) || value < 0) throw new HttpError(400, "INVALID_QUANTITY", "Quantities must be non-negative whole numbers.");
  if (!Number.isSafeInteger(unitsPerPack) || unitsPerPack < 1) throw new HttpError(400, "INVALID_PACKING", "Units per pack must be a positive whole number.");
  const total = packQuantity * unitsPerPack + baseQuantity;
  if (!Number.isSafeInteger(total) || total > 2_000_000_000) throw new HttpError(400, "QUANTITY_TOO_LARGE", "Quantity is too large.");
  return total;
}

export function fromBaseQuantity(quantity: number, unitsPerPack: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(unitsPerPack) || unitsPerPack < 1) throw new HttpError(400, "INVALID_QUANTITY", "Invalid stock quantity.");
  return { packs: Math.floor(quantity / unitsPerPack), baseUnits: quantity % unitsPerPack };
}

export interface ApplyMovementInput {
  productId: string; batchId?: string | null | undefined; movementType: StockMovementType; quantityBase: number;
  sourceType: SourceType; sourceId: string; sourceLineId: string; createdById: string; notes?: string;
  unitCostMinor?: number;
}

export async function applyStockMovement(tx: TransactionClient, input: ApplyMovementInput) {
  if (!Number.isSafeInteger(input.quantityBase)) throw new HttpError(400, "INVALID_QUANTITY", "Stock quantity must be a whole number.");
  if (input.movementType === "CARTON_OPEN") {
    if (input.quantityBase !== 0) throw new HttpError(400, "INVALID_MOVEMENT", "Opening a carton does not change base-unit stock.");
  } else if ((POSITIVE.has(input.movementType) && input.quantityBase <= 0) || (NEGATIVE.has(input.movementType) && input.quantityBase >= 0)) {
    throw new HttpError(400, "INVALID_MOVEMENT", "Movement direction does not match its type.");
  }

  const product = await tx.product.findFirst({ where: { id: input.productId, deletedAt: null } });
  if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  let batchBalance: number | null = null;
  if (input.batchId) {
    const batch = await tx.productBatch.findFirst({ where: { id: input.batchId, productId: input.productId } });
    if (!batch) throw new HttpError(400, "INVALID_BATCH", "Batch does not belong to this product.");
    const businessDate = new Date(); businessDate.setHours(0, 0, 0, 0);
    if ((input.movementType === "SALE" || input.movementType === "REPLACEMENT_OUT") && batch.expiryDate && batch.expiryDate < businessDate) throw new HttpError(409, "BATCH_EXPIRED", "Expired batch stock cannot be issued.");
    const batchUpdate = await tx.productBatch.updateMany({
      where: { id: batch.id, ...(input.quantityBase < 0 ? { stockOnHandBaseQty: { gte: -input.quantityBase } } : {}) },
      data: { stockOnHandBaseQty: { increment: input.quantityBase } },
    });
    if (!batchUpdate.count) throw new HttpError(409, "NEGATIVE_STOCK", "Insufficient stock in the selected batch.");
    batchBalance = batch.stockOnHandBaseQty + input.quantityBase;
  } else if (input.quantityBase < 0) {
    const batches = await tx.productBatch.aggregate({ where: { productId: input.productId }, _sum: { stockOnHandBaseQty: true } });
    const unbatchedStock = Math.max(0, product.stockOnHandBaseQty - (batches._sum.stockOnHandBaseQty ?? 0));
    if (unbatchedStock < -input.quantityBase) throw new HttpError(409, "NEGATIVE_STOCK", "Insufficient general stock. Select the batch that contains this stock.");
  }
  const effectiveUnitCost = input.unitCostMinor ?? product.averageCostMinor ?? product.purchasePriceMinor;
  if (!Number.isSafeInteger(effectiveUnitCost) || effectiveUnitCost < 0) throw new HttpError(400, "INVALID_STOCK_COST", "Stock unit cost must be a non-negative minor-unit amount.");
  const valueMinor = input.quantityBase * effectiveUnitCost;
  const nextQuantity = product.stockOnHandBaseQty + input.quantityBase;
  const currentValue = product.inventoryValueMinor || product.stockOnHandBaseQty * (product.averageCostMinor || product.purchasePriceMinor);
  const nextValue = Math.max(0, currentValue + valueMinor);
  const nextAverage = nextQuantity > 0 ? Math.round(nextValue / nextQuantity) : 0;
  const updated = await tx.product.updateMany({
    where: { id: input.productId, ...(input.quantityBase < 0 ? { stockOnHandBaseQty: { gte: -input.quantityBase } } : {}) },
    data: { stockOnHandBaseQty: { increment: input.quantityBase }, inventoryValueMinor: nextValue, averageCostMinor: nextAverage },
  });
  if (!updated.count) throw new HttpError(409, "NEGATIVE_STOCK", "Insufficient available stock.");
  const balanceAfterBase = product.stockOnHandBaseQty + input.quantityBase;
  return tx.stockMovement.create({ data: { ...input, unitCostMinor: effectiveUnitCost, valueMinor, batchId: input.batchId ?? null, balanceAfterBase, batchBalanceAfterBase: batchBalance } });
}
