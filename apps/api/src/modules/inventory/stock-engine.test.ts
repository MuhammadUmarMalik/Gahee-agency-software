import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http-error.js";
import { applyStockMovement, fromBaseQuantity, toBaseQuantity, type TransactionClient } from "./stock-engine.js";

describe("inventory conversion", () => {
  it("converts cartons and loose pieces into base units", () => expect(toBaseQuantity(3, 2, 12)).toBe(38));
  it("splits base stock for display", () => expect(fromBaseQuantity(38, 12)).toEqual({ packs: 3, baseUnits: 2 }));
  it("rejects fractional quantities", () => expect(() => toBaseQuantity(1.5, 0, 12)).toThrow(HttpError));
});

describe("applyStockMovement", () => {
  function transaction(productStock = 20, productUpdated = 1, batchStock = 0) { return { product: { findFirst: vi.fn().mockResolvedValue({ id: "p1", stockOnHandBaseQty: productStock, averageCostMinor: 125, purchasePriceMinor: 100, inventoryValueMinor: productStock * 125 }), updateMany: vi.fn().mockResolvedValue({ count: productUpdated }) }, productBatch: { findFirst: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { stockOnHandBaseQty: batchStock } }) }, stockMovement: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) } } as unknown as TransactionClient; }
  it("creates a signed immutable movement with its resulting balance", async () => { const tx = transaction(); const result = await applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -5, sourceType: "SALE", sourceId: "s1", sourceLineId: "i1", createdById: "u1" }); expect(result.balanceAfterBase).toBe(15); expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ stockOnHandBaseQty: { gte: 5 } }) })); expect(tx.stockMovement.create).toHaveBeenCalledOnce(); });
  it("blocks negative stock without writing a movement", async () => { const tx = transaction(3, 0); await expect(applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -5, sourceType: "SALE", sourceId: "s1", sourceLineId: "i1", createdById: "u1" })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" }); expect(tx.stockMovement.create).not.toHaveBeenCalled(); });
  it("records carton opening without changing base stock", async () => { const tx = transaction(); const result = await applyStockMovement(tx, { productId: "p1", movementType: "CARTON_OPEN", quantityBase: 0, sourceType: "STOCK_ADJUSTMENT", sourceId: "c1", sourceLineId: "1", createdById: "u1" }); expect(result.balanceAfterBase).toBe(20); });
  it("does not silently remove batch stock when no batch is selected", async () => { const tx = transaction(20, 1, 18); await expect(applyStockMovement(tx, { productId: "p1", movementType: "DAMAGE", quantityBase: -3, sourceType: "DAMAGE_ENTRY", sourceId: "d1", sourceLineId: "1", createdById: "u1" })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" }); expect(tx.product.updateMany).not.toHaveBeenCalled(); });
  it("carries weighted-average value through stock issues", async () => { const tx = transaction(20); const result = await applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -4, sourceType: "SALE", sourceId: "s2", sourceLineId: "i2", createdById: "u1" }); expect(result).toMatchObject({ unitCostMinor: 125, valueMinor: -500 }); expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inventoryValueMinor: 2000, averageCostMinor: 125 }) })); });
});
