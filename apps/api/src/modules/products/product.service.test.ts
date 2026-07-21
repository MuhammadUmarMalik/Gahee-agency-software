import { describe, expect, it, vi } from "vitest";
import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import type { CreateProductInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { AccountingPostingService } from "../accounting/posting.service.js";
import { ProductService } from "./product.service.js";

const input: CreateProductInput = {
  name: "Premium Cooking Oil 1L", brandId: null, categoryId: null, productType: "OIL", sizeValue: 1, sizeUnit: "LITER",
  baseUnitId: "bottle-unit", packUnitId: "box-unit", unitsPerPack: 12, purchaseUnit: "PACK", saleUnit: "BASE",
  sku: "OIL-1L", barcode: "2901234567890", purchasePrice: "2500.00", retailPrice: "250.00", wholesalePrice: "235.50",
  minimumPrice: "225.00", taxRatePercent: "0.00", fbrHsCode: "1511.9090", fbrUom: "Numbers, pieces, units", fbrSaleType: "Goods at standard rate (default)", fbrFixedNotifiedValue: "0.00", fbrSroScheduleNo: "", fbrSroItemSerialNo: "", reorderLevelBaseQty: 24, openingStockPackQty: 2, openingStockBaseQty: 5,
  rackLocation: "A-01", notes: "", isActive: true,
};

function productRecord(stockOnHandBaseQty = 29) {
  const now = new Date("2026-07-17T00:00:00.000Z");
  return {
    id: "product-id", name: input.name, sku: input.sku, barcode: input.barcode, categoryId: null, brandId: null,
    baseUnitId: input.baseUnitId, productType: "OIL" as const, sizeValue: 1, sizeUnit: "LITER" as const,
    purchasePriceMinor: 250000, retailPriceMinor: 25000, wholesalePriceMinor: 23550, minimumPriceMinor: 22500,
    taxRateBps: 0, fbrHsCode: "1511.9090", fbrUom: "Numbers, pieces, units", fbrSaleType: "Goods at standard rate (default)", fbrFixedNotifiedValueMinor: 0, fbrSroScheduleNo: null, fbrSroItemSerialNo: null, reorderLevelBaseQty: 24, stockOnHandBaseQty, rackLocation: "A-01", notes: null,
    trackBatch: true, trackExpiry: true, isActive: true, deletedAt: null, createdAt: now, updatedAt: now,
    category: null, brand: null, baseUnit: { id: "bottle-unit", name: "Bottle", symbol: "btl" },
    packings: [
      { id: "base-packing", productId: "product-id", unitId: "bottle-unit", name: "Bottle", unitsPerPack: 1, barcode: null, isPurchaseUnit: false, isSaleUnit: true, isActive: true, unit: { id: "bottle-unit", name: "Bottle", symbol: "btl" } },
      { id: "pack-packing", productId: "product-id", unitId: "box-unit", name: "Box", unitsPerPack: 12, barcode: null, isPurchaseUnit: true, isSaleUnit: false, isActive: true, unit: { id: "box-unit", name: "Box", symbol: "box" } },
    ],
  };
}

describe("ProductService", () => {
  it("creates opening stock, movement, and audit in one transaction", async () => {
    const accountingPost = vi.spyOn(AccountingPostingService, "post").mockResolvedValue({ id: "journal-id" } as never);
    const tx = {
      unit: { findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, name: where.id === "bottle-unit" ? "Bottle" : "Box" })) },
      product: {
        create: vi.fn(() => Promise.resolve(productRecord(0))),
        findFirst: vi.fn(() => Promise.resolve({ id: "product-id", stockOnHandBaseQty: 0, averageCostMinor: 0, purchasePriceMinor: 250000, inventoryValueMinor: 0 })),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
        findFirstOrThrow: vi.fn(() => Promise.resolve(productRecord(29))),
      },
      stockMovement: { create: vi.fn(() => Promise.resolve({ id: "movement-id" })) },
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit-id" })) },
      productBatch: {
        create: vi.fn(() => Promise.resolve({ id: "batch-id", stockOnHandBaseQty: 0 })),
        findFirst: vi.fn(() => Promise.resolve({ id: "batch-id", productId: "product-id", stockOnHandBaseQty: 0 })),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
    };
    const db = {
      unit: { findMany: vi.fn(() => Promise.resolve([{ id: "bottle-unit", name: "Bottle", symbol: "btl" }, { id: "box-unit", name: "Box", symbol: "box" }])) },
      product: { findFirst: vi.fn(() => Promise.resolve(null)) },
      productPacking: { findFirst: vi.fn(() => Promise.resolve(null)) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as AppDbClient;

    const result = await new ProductService(db).create(input, "owner-id");

    expect(result.stockOnHandBaseQty).toBe(29);
    expect(tx.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stockOnHandBaseQty: 0, inventoryValueMinor: 0, averageCostMinor: 0 }) }));
    expect(tx.productBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockOnHandBaseQty: 0 }) });
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stockOnHandBaseQty: { increment: 29 } }) }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ movementType: "OPENING_STOCK", quantityBase: 29, balanceAfterBase: 29, createdById: "owner-id" }) });
    expect(accountingPost).toHaveBeenCalledWith(tx, expect.objectContaining({ sourceType: "PRODUCT", sourceId: "product-id" }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "CREATE", entityType: "Product", entityId: "product-id" }) });
    accountingPost.mockRestore();
  });

  it("rejects a duplicate SKU before opening a write transaction", async () => {
    const transaction = vi.fn();
    const db = {
      unit: { findMany: vi.fn(() => Promise.resolve([{ id: "bottle-unit", name: "Bottle", symbol: "btl" }, { id: "box-unit", name: "Box", symbol: "box" }])) },
      product: { findFirst: vi.fn(() => Promise.resolve({ sku: input.sku, barcode: null })) },
      productPacking: { findFirst: vi.fn(() => Promise.resolve(null)) },
      $transaction: transaction,
    } as unknown as AppDbClient;
    const error = await new ProductService(db).create(input, "owner-id").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).code).toBe("DUPLICATE_SKU");
    expect(transaction).not.toHaveBeenCalled();
  });
});
