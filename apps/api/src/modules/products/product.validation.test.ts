import { describe, expect, it } from "vitest";
import { createProductInputSchema, isIndividualUnit, isOuterPackUnit } from "@oil-agency/shared";
import { calculateOpeningBaseQuantity, moneyToMinor, minorToMoney, percentToBps } from "./product.service.js";

const validProduct = {
  name: "Premium Cooking Oil 1L",
  brandId: null,
  categoryId: null,
  productType: "OIL" as const,
  sizeValue: 1,
  sizeUnit: "LITER" as const,
  baseUnitId: "bottle-unit",
  packUnitId: "box-unit",
  unitsPerPack: 12,
  purchaseUnit: "PACK" as const,
  saleUnit: "BASE" as const,
  sku: "oil-1l",
  barcode: "2901234567890",
  purchasePrice: "2500.00",
  retailPrice: "250.00",
  wholesalePrice: "235.50",
  minimumPrice: "225.00",
  taxRatePercent: "0.00",
  reorderLevelBaseQty: 24,
  openingStockPackQty: 2,
  openingStockBaseQty: 5,
  rackLocation: "A-01",
  notes: "",
  isActive: true,
};

describe("product validation and conversion", () => {
  it("normalizes SKU and converts outer packs plus individual items", () => {
    const result = createProductInputSchema.parse(validProduct);
    expect(result.sku).toBe("OIL-1L");
    expect(calculateOpeningBaseQuantity(result.openingStockPackQty, result.openingStockBaseQty, result.unitsPerPack)).toBe(29);
  });

  it("rejects using the same unit as base and pack", () => {
    expect(createProductInputSchema.safeParse({ ...validProduct, packUnitId: validProduct.baseUnitId }).success).toBe(false);
  });

  it("classifies tin, balti, bottle, and pouch as individual items", () => {
    expect(isIndividualUnit({ name: "Balti", symbol: "balti" })).toBe(true);
    expect(isIndividualUnit({ name: "Bottle", symbol: "btl" })).toBe(true);
    expect(isIndividualUnit({ name: "Pouch", symbol: "pouch" })).toBe(true);
    expect(isIndividualUnit({ name: "Box", symbol: "box" })).toBe(false);
  });

  it("supports a 2.5 kg balti tray and individual-only 10 kg balti", () => {
    expect(createProductInputSchema.safeParse({ ...validProduct, sizeValue: 2.5, baseUnitId: "balti", packUnitId: "tray", unitsPerPack: 4 }).success).toBe(true);
    expect(createProductInputSchema.safeParse({ ...validProduct, sizeValue: 10, baseUnitId: "balti", packUnitId: "balti", unitsPerPack: 1, purchaseUnit: "BASE", saleUnit: "BASE" }).success).toBe(true);
  });

  it("classifies tray, box, and pack as outer packing", () => {
    expect(isOuterPackUnit({ name: "Tray", symbol: "tray" })).toBe(true);
    expect(isOuterPackUnit({ name: "Pack", symbol: "pack" })).toBe(true);
    expect(isOuterPackUnit({ name: "Tin", symbol: "tin" })).toBe(false);
  });

  it("rejects minimum price above retail price", () => {
    expect(createProductInputSchema.safeParse({ ...validProduct, minimumPrice: "251.00" }).success).toBe(false);
  });

  it("converts money and percentage without floating point arithmetic", () => {
    expect(moneyToMinor("1234.56")).toBe(123456);
    expect(minorToMoney(123456)).toBe("1234.56");
    expect(percentToBps("17.50")).toBe(1750);
  });
});
