import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../lib/http-error.js";
import type { TransactionClient } from "../../lib/db.js";
import { applyStockMovement, fromBaseQuantity, toBaseQuantity } from "./stock-engine.js";

describe("inventory conversion", () => {
  it("converts cartons and loose pieces into base units", () => expect(toBaseQuantity(3, 2, 12)).toBe(38));
  it("splits base stock for display", () => expect(fromBaseQuantity(38, 12)).toEqual({ packs: 3, baseUnits: 2 }));
  it("rejects fractional quantities", () => expect(() => toBaseQuantity(1.5, 0, 12)).toThrow(HttpError));
  it("keeps 1 box = 6 bottles arithmetic in base units", () => {
    expect(toBaseQuantity(20, 0, 6)).toBe(120);
    expect(fromBaseQuantity(120, 6)).toEqual({ packs: 20, baseUnits: 0 });
    expect(fromBaseQuantity(240, 6)).toEqual({ packs: 40, baseUnits: 0 });
    expect(fromBaseQuantity(115, 6)).toEqual({ packs: 19, baseUnits: 1 });
  });
});

describe("applyStockMovement", () => {
  function transaction(productStock = 20, productUpdated = 1, batchStock = 0) { return { product: { findFirst: vi.fn().mockResolvedValue({ id: "p1", stockOnHandBaseQty: productStock, averageCostMinor: 125, purchasePriceMinor: 100, inventoryValueMinor: productStock * 125 }), updateMany: vi.fn().mockResolvedValue({ count: productUpdated }) }, productBatch: { findFirst: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { stockOnHandBaseQty: batchStock } }) }, stockMovement: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) } } as unknown as TransactionClient; }
  it("creates a signed immutable movement with its resulting balance", async () => { const tx = transaction(); const result = await applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -5, sourceType: "SALE", sourceId: "s1", sourceLineId: "i1", createdById: "u1" }); expect(result.balanceAfterBase).toBe(15); expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ stockOnHandBaseQty: { gte: 5 } }) })); expect(tx.stockMovement.create).toHaveBeenCalledOnce(); });
  it("blocks negative stock without writing a movement", async () => { const tx = transaction(3, 0); await expect(applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -5, sourceType: "SALE", sourceId: "s1", sourceLineId: "i1", createdById: "u1" })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" }); expect(tx.stockMovement.create).not.toHaveBeenCalled(); });
  it("records carton opening without changing base stock", async () => { const tx = transaction(); const result = await applyStockMovement(tx, { productId: "p1", movementType: "CARTON_OPEN", quantityBase: 0, sourceType: "STOCK_ADJUSTMENT", sourceId: "c1", sourceLineId: "1", createdById: "u1" }); expect(result.balanceAfterBase).toBe(20); });
  it("does not silently remove batch stock when no batch is selected", async () => { const tx = transaction(20, 1, 18); await expect(applyStockMovement(tx, { productId: "p1", movementType: "DAMAGE", quantityBase: -3, sourceType: "DAMAGE_ENTRY", sourceId: "d1", sourceLineId: "1", createdById: "u1" })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" }); expect(tx.product.updateMany).not.toHaveBeenCalled(); });
  it("carries weighted-average value through stock issues", async () => { const tx = transaction(20); const result = await applyStockMovement(tx, { productId: "p1", movementType: "SALE", quantityBase: -4, sourceType: "SALE", sourceId: "s2", sourceLineId: "i2", createdById: "u1" }); expect(result).toMatchObject({ unitCostMinor: 125, valueMinor: -500 }); expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inventoryValueMinor: 2000, averageCostMinor: 125 }) })); });
  it("adds and removes 20 boxes as 120 bottles without zeroing remaining stock", async () => {
    let productStock = 0;
    let batchStock = 0;
    const tx = {
      product: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve({ id: "p1", stockOnHandBaseQty: productStock, averageCostMinor: 100, purchasePriceMinor: 100, inventoryValueMinor: productStock * 100 })),
        updateMany: vi.fn().mockImplementation(({ where, data }) => {
          const decrement = data.stockOnHandBaseQty.increment < 0 ? -data.stockOnHandBaseQty.increment : 0;
          if (where.stockOnHandBaseQty?.gte !== undefined && productStock < decrement) return Promise.resolve({ count: 0 });
          productStock += data.stockOnHandBaseQty.increment;
          return Promise.resolve({ count: 1 });
        }),
      },
      productBatch: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve({ id: "b1", productId: "p1", stockOnHandBaseQty: batchStock })),
        updateMany: vi.fn().mockImplementation(({ where, data }) => {
          const decrement = data.stockOnHandBaseQty.increment < 0 ? -data.stockOnHandBaseQty.increment : 0;
          if (where.stockOnHandBaseQty?.gte !== undefined && batchStock < decrement) return Promise.resolve({ count: 0 });
          batchStock += data.stockOnHandBaseQty.increment;
          return Promise.resolve({ count: 1 });
        }),
        aggregate: vi.fn(),
      },
      stockMovement: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    } as unknown as TransactionClient;
    const twentyBoxes = toBaseQuantity(20, 0, 6);

    await applyStockMovement(tx, { productId: "p1", batchId: "b1", movementType: "ADJUSTMENT_IN", quantityBase: twentyBoxes, sourceType: "STOCK_ADJUSTMENT", sourceId: "a1", sourceLineId: "1", createdById: "u1" });
    expect(productStock).toBe(120);
    expect(fromBaseQuantity(productStock, 6)).toEqual({ packs: 20, baseUnits: 0 });

    await applyStockMovement(tx, { productId: "p1", batchId: "b1", movementType: "ADJUSTMENT_IN", quantityBase: twentyBoxes, sourceType: "STOCK_ADJUSTMENT", sourceId: "a2", sourceLineId: "1", createdById: "u1" });
    expect(productStock).toBe(240);
    expect(fromBaseQuantity(productStock, 6)).toEqual({ packs: 40, baseUnits: 0 });

    await applyStockMovement(tx, { productId: "p1", batchId: "b1", movementType: "ADJUSTMENT_OUT", quantityBase: -twentyBoxes, sourceType: "STOCK_ADJUSTMENT", sourceId: "a3", sourceLineId: "1", createdById: "u1" });
    expect(productStock).toBe(120);
    expect(fromBaseQuantity(productStock, 6)).toEqual({ packs: 20, baseUnits: 0 });

    await applyStockMovement(tx, { productId: "p1", batchId: "b1", movementType: "ADJUSTMENT_OUT", quantityBase: -5, sourceType: "STOCK_ADJUSTMENT", sourceId: "a4", sourceLineId: "1", createdById: "u1" });
    expect(productStock).toBe(115);
    expect(batchStock).toBe(115);
    expect(fromBaseQuantity(productStock, 6)).toEqual({ packs: 19, baseUnits: 1 });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(4);
  });
});
