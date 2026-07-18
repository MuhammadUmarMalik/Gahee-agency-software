import { randomInt } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { isIndividualUnit, isOuterPackUnit, type CreateProductInput, type GenerateSkuQuery, type PackingMode, type ProductDto, type ProductListQuery, type UpdateProductInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { AccountingPostingService } from "../accounting/posting.service.js";

const productInclude = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  baseUnit: { select: { id: true, name: true, symbol: true } },
  packings: { include: { unit: { select: { id: true, name: true, symbol: true } } }, orderBy: { unitsPerPack: "asc" as const } },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type Transaction = Prisma.TransactionClient;

export function moneyToMinor(value: string): number {
  const [whole = "0", fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2_147_483_647) throw new HttpError(400, "AMOUNT_TOO_LARGE", "Amount exceeds the supported limit.");
  return amount;
}

export function minorToMoney(value: number): string { const sign = value < 0 ? "-" : ""; const absolute = Math.abs(value); return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`; }
export function percentToBps(value: string): number { return moneyToMinor(value); }
export function bpsToPercent(value: number): string { return minorToMoney(value); }

export function calculateOpeningBaseQuantity(packQuantity: number, baseQuantity: number, unitsPerPack: number): number {
  const quantity = packQuantity * unitsPerPack + baseQuantity;
  if (!Number.isSafeInteger(quantity) || quantity > 100_000_000) throw new HttpError(400, "OPENING_STOCK_TOO_LARGE", "Opening stock exceeds the supported limit.");
  return quantity;
}

function toDto(product: ProductRecord): ProductDto {
  const basePacking = product.packings.find((packing) => packing.unitsPerPack === 1);
  const packPacking = product.packings.find((packing) => packing.unitsPerPack > 1);
  if (!basePacking) throw new HttpError(500, "PACKING_CONFIGURATION_INVALID", "Product packing configuration is invalid.");
  const effectivePack = packPacking ?? basePacking;
  const packingMode = (predicate: (packing: ProductRecord["packings"][number]) => boolean): PackingMode => packPacking && predicate(packPacking) ? "PACK" : "BASE";
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? "",
    productType: product.productType,
    sizeValue: product.sizeValue,
    sizeUnit: product.sizeUnit,
    category: product.category,
    brand: product.brand,
    baseUnit: product.baseUnit,
    packUnit: effectivePack.unit,
    unitsPerPack: effectivePack.unitsPerPack,
    purchaseUnit: packingMode((packing) => packing.isPurchaseUnit),
    saleUnit: packingMode((packing) => packing.isSaleUnit),
    purchasePrice: minorToMoney(product.purchasePriceMinor),
    retailPrice: minorToMoney(product.retailPriceMinor),
    wholesalePrice: minorToMoney(product.wholesalePriceMinor),
    minimumPrice: minorToMoney(product.minimumPriceMinor),
    taxRatePercent: bpsToPercent(product.taxRateBps),
    reorderLevelBaseQty: product.reorderLevelBaseQty,
    stockOnHandBaseQty: product.stockOnHandBaseQty,
    rackLocation: product.rackLocation ?? "",
    notes: product.notes ?? "",
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export class ProductService {
  constructor(private readonly db: PrismaClient) {}

  async list(query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.active === "ACTIVE" ? { isActive: true } : query.active === "INACTIVE" ? { isActive: false } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.productType ? { productType: query.productType } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search } }, { sku: { contains: query.search } }, { barcode: { contains: query.search } }] } : {}),
    };
    const [records, total] = await this.db.$transaction([
      this.db.product.findMany({ where, include: productInclude, orderBy: [{ name: "asc" }, { sku: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.product.count({ where }),
    ]);
    return { products: records.map(toDto), pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  }

  async options() {
    for (const unit of [
      { name: "Tin", symbol: "tin", aliases: ["tin"] }, { name: "Balti", symbol: "balti", aliases: ["balti"] },
      { name: "Bottle", symbol: "btl", aliases: ["btl", "bottle"] }, { name: "Pouch", symbol: "pouch", aliases: ["pouch"] }, { name: "Tray", symbol: "tray", aliases: ["tray"] },
      { name: "Box", symbol: "box", aliases: ["box"] }, { name: "Carton", symbol: "ctn", aliases: ["carton", "ctn"] }, { name: "Pack", symbol: "pack", aliases: ["pack"] },
    ]) {
      const existing = await this.db.unit.findFirst({ where: { OR: [{ name: unit.name }, { symbol: { in: unit.aliases } }] } });
      if (existing) await this.db.unit.update({ where: { id: existing.id }, data: { isActive: true, deletedAt: null } });
      else await this.db.unit.create({ data: { name: unit.name, symbol: unit.symbol } });
    }
    const [categories, brands, units] = await Promise.all([
      this.db.category.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.db.brand.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.db.unit.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, symbol: true }, orderBy: { name: "asc" } }),
    ]);
    return { categories, brands, units };
  }

  async get(id: string): Promise<ProductDto> {
    const product = await this.db.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
    if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
    return toDto(product);
  }

  async generateBarcode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const body = `290${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
      const barcode = body + ean13CheckDigit(body);
      const [product, packing] = await Promise.all([this.db.product.findFirst({ where: { barcode } }), this.db.productPacking.findFirst({ where: { barcode } })]);
      if (!product && !packing) return barcode;
    }
    throw new HttpError(503, "BARCODE_GENERATION_FAILED", "Could not generate a unique barcode. Try again.");
  }

  async generateSku(input: GenerateSkuQuery): Promise<string> {
    const unit = input.baseUnitId ? await this.db.unit.findUnique({ where: { id: input.baseUnitId }, select: { symbol: true } }) : null;
    const size = input.sizeValue && input.sizeUnit ? `${input.sizeValue}${({ MILLILITER: "ML", LITER: "L", GRAM: "G", KILOGRAM: "KG" } as const)[input.sizeUnit]}` : "";
    const name = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 3).join("-") || "PRODUCT";
    const base = [name, size, unit?.symbol.toUpperCase()].filter(Boolean).join("-").slice(0, 44).replace(/-$/g, "");
    for (let index = 1; index <= 999; index += 1) {
      const candidate = index === 1 ? base : `${base.slice(0, 46 - String(index).length)}-${index}`;
      if (!await this.db.product.findUnique({ where: { sku: candidate }, select: { id: true } })) return candidate;
    }
    throw new HttpError(503, "SKU_GENERATION_FAILED", "Could not generate a unique SKU. Try a more specific product name.");
  }

  async create(input: CreateProductInput, actorId: string): Promise<ProductDto> {
    await this.validateReferences(input);
    const sku = input.sku || await this.generateSku({ name: input.name, ...(input.sizeValue ? { sizeValue: input.sizeValue } : {}), ...(input.sizeUnit ? { sizeUnit: input.sizeUnit } : {}), baseUnitId: input.baseUnitId });
    await this.validateIdentifiers(sku, input.barcode);
    const openingQuantity = calculateOpeningBaseQuantity(input.openingStockPackQty, input.openingStockBaseQty, input.unitsPerPack);
    try {
      return await this.db.$transaction(async (tx) => {
        const [baseUnit, packUnit] = await Promise.all([tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } }), tx.unit.findUniqueOrThrow({ where: { id: input.packUnitId } })]);
        const product = await tx.product.create({
          data: {
            name: input.name, sku, barcode: input.barcode || null, categoryId: input.categoryId, brandId: input.brandId,
            baseUnitId: input.baseUnitId, productType: input.productType, sizeValue: input.sizeValue, sizeUnit: input.sizeUnit,
            purchasePriceMinor: moneyToMinor(input.purchasePrice), averageCostMinor: openingQuantity > 0 ? moneyToMinor(input.purchasePrice) : 0, inventoryValueMinor: openingQuantity * moneyToMinor(input.purchasePrice), retailPriceMinor: moneyToMinor(input.retailPrice),
            wholesalePriceMinor: moneyToMinor(input.wholesalePrice), minimumPriceMinor: moneyToMinor(input.minimumPrice), taxRateBps: percentToBps(input.taxRatePercent),
            reorderLevelBaseQty: input.reorderLevelBaseQty, stockOnHandBaseQty: openingQuantity, rackLocation: input.rackLocation || null,
            notes: input.notes || null, isActive: input.isActive,
            packings: { create: packingRows(input, baseUnit.name, packUnit.name) },
          },
          include: productInclude,
        });
        if (openingQuantity > 0) await this.createOpeningStock(tx, product, openingQuantity, actorId);
        const dto = toDto(product);
        await tx.auditLog.create({ data: { userId: actorId, action: "CREATE", entityType: "Product", entityId: product.id, afterJson: JSON.stringify(dto) } });
        return dto;
      });
    } catch (error) { this.handleUniqueError(error); }
  }

  async update(id: string, input: UpdateProductInput, actorId: string): Promise<ProductDto> {
    await this.validateReferences(input);
    const sku = input.sku || await this.generateSku({ name: input.name, ...(input.sizeValue ? { sizeValue: input.sizeValue } : {}), ...(input.sizeUnit ? { sizeUnit: input.sizeUnit } : {}), baseUnitId: input.baseUnitId });
    await this.validateIdentifiers(sku, input.barcode, id);
    const before = await this.db.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
    if (!before) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
    if (before.baseUnitId !== input.baseUnitId) {
      const movementCount = await this.db.stockMovement.count({ where: { productId: id } });
      if (movementCount > 0) throw new HttpError(409, "BASE_UNIT_LOCKED", "Base unit cannot be changed after stock has been recorded.");
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const [baseUnit, packUnit] = await Promise.all([tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } }), tx.unit.findUniqueOrThrow({ where: { id: input.packUnitId } })]);
        await tx.productPacking.deleteMany({ where: { productId: id } });
        const product = await tx.product.update({
          where: { id },
          data: {
            name: input.name, sku, barcode: input.barcode || null, categoryId: input.categoryId, brandId: input.brandId,
            baseUnitId: input.baseUnitId, productType: input.productType, sizeValue: input.sizeValue, sizeUnit: input.sizeUnit,
            purchasePriceMinor: moneyToMinor(input.purchasePrice), retailPriceMinor: moneyToMinor(input.retailPrice),
            wholesalePriceMinor: moneyToMinor(input.wholesalePrice), minimumPriceMinor: moneyToMinor(input.minimumPrice), taxRateBps: percentToBps(input.taxRatePercent),
            reorderLevelBaseQty: input.reorderLevelBaseQty, rackLocation: input.rackLocation || null, notes: input.notes || null, isActive: input.isActive,
            packings: { create: packingRows(input, baseUnit.name, packUnit.name) },
          },
          include: productInclude,
        });
        const dto = toDto(product);
        await tx.auditLog.create({ data: { userId: actorId, action: "UPDATE", entityType: "Product", entityId: id, beforeJson: JSON.stringify(toDto(before)), afterJson: JSON.stringify(dto) } });
        return dto;
      });
    } catch (error) { this.handleUniqueError(error); }
  }

  async remove(id: string, actorId: string): Promise<void> {
    const product = await this.db.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
    if (!product) throw new HttpError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
    if (product.stockOnHandBaseQty !== 0) throw new HttpError(409, "PRODUCT_HAS_STOCK", "A product with stock on hand cannot be deleted.");
    await this.db.$transaction([
      this.db.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }),
      this.db.auditLog.create({ data: { userId: actorId, action: "SOFT_DELETE", entityType: "Product", entityId: id, beforeJson: JSON.stringify(toDto(product)) } }),
    ]);
  }

  private async validateReferences(input: UpdateProductInput) {
    const unitIds = [...new Set([input.baseUnitId, input.packUnitId])];
    const [units, category, brand] = await Promise.all([
      this.db.unit.findMany({ where: { id: { in: unitIds }, isActive: true, deletedAt: null }, select: { id: true, name: true, symbol: true } }),
      input.categoryId ? this.db.category.findFirst({ where: { id: input.categoryId, isActive: true, deletedAt: null }, select: { id: true } }) : null,
      input.brandId ? this.db.brand.findFirst({ where: { id: input.brandId, isActive: true, deletedAt: null }, select: { id: true } }) : null,
    ]);
    const individualOnly = input.unitsPerPack === 1;
    if (units.length !== (individualOnly ? 1 : 2)) throw new HttpError(400, "INVALID_UNIT", individualOnly ? "Select a valid individual item." : "Select a valid individual item and a different outer pack.");
    const baseUnit = units.find((unit) => unit.id === input.baseUnitId);
    const packUnit = units.find((unit) => unit.id === input.packUnitId);
    if (!baseUnit || !isIndividualUnit(baseUnit)) throw new HttpError(400, "INVALID_BASE_UNIT", "The individual item must be Tin, Balti, or Bottle.");
    if (individualOnly && input.packUnitId !== input.baseUnitId) throw new HttpError(400, "INVALID_INDIVIDUAL_PACKING", "An individual-only product must use one item per unit.");
    if (!individualOnly && (!packUnit || !isOuterPackUnit(packUnit))) throw new HttpError(400, "INVALID_PACK_UNIT", "The outer packing must be Tray, Box, Carton, or Pack.");
    if (input.categoryId && !category) throw new HttpError(400, "INVALID_CATEGORY", "Selected category is unavailable.");
    if (input.brandId && !brand) throw new HttpError(400, "INVALID_BRAND", "Selected brand is unavailable.");
  }

  private async validateIdentifiers(sku: string, barcode: string, excludeId?: string) {
    const product = await this.db.product.findFirst({ where: { ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ sku }, ...(barcode ? [{ barcode }] : [])] }, select: { sku: true, barcode: true } });
    if (product?.sku === sku) throw new HttpError(409, "DUPLICATE_SKU", "That SKU is already in use.");
    if (barcode && product?.barcode === barcode) throw new HttpError(409, "DUPLICATE_BARCODE", "That barcode is already in use.");
    if (barcode) {
      const packing = await this.db.productPacking.findFirst({ where: { barcode, ...(excludeId ? { productId: { not: excludeId } } : {}) }, select: { id: true } });
      if (packing) throw new HttpError(409, "DUPLICATE_BARCODE", "That barcode is already in use.");
    }
  }

  private async createOpeningStock(tx: Transaction, product: ProductRecord, quantity: number, actorId: string) {
    const valueMinor = quantity * product.purchasePriceMinor;
    const batch = await tx.productBatch.create({ data: { productId: product.id, batchNumber: "OPENING", purchasePriceMinor: product.purchasePriceMinor, stockOnHandBaseQty: quantity } });
    await tx.stockMovement.create({ data: {
      productId: product.id, batchId: batch.id, movementType: "OPENING_STOCK", quantityBase: quantity,
      balanceAfterBase: quantity, batchBalanceAfterBase: quantity, unitCostMinor: product.purchasePriceMinor, valueMinor, sourceType: "PRODUCT", sourceId: product.id,
      sourceLineId: "OPENING_STOCK", notes: "Opening stock recorded during product creation", createdById: actorId,
    } });
    if (valueMinor) await AccountingPostingService.post(tx, { sourceType: "PRODUCT", sourceId: product.id, transactionDate: new Date(), description: `Opening stock - ${product.name}`, createdById: actorId, lines: [{ systemCode: "INVENTORY", debitMinor: valueMinor, productId: product.id }, { systemCode: "OPENING_EQUITY", creditMinor: valueMinor }] });
  }

  private handleUniqueError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "DUPLICATE_IDENTIFIER", "SKU or barcode is already in use.");
    throw error;
  }
}

function packingRows(input: UpdateProductInput, baseName: string, packName: string) {
  if (input.unitsPerPack === 1 || input.baseUnitId === input.packUnitId) return [{ unitId: input.baseUnitId, name: baseName, unitsPerPack: 1, isPurchaseUnit: true, isSaleUnit: true }];
  return [
    { unitId: input.baseUnitId, name: baseName, unitsPerPack: 1, isPurchaseUnit: input.purchaseUnit === "BASE", isSaleUnit: input.saleUnit === "BASE" },
    { unitId: input.packUnitId, name: packName, unitsPerPack: input.unitsPerPack, isPurchaseUnit: input.purchaseUnit === "PACK", isSaleUnit: input.saleUnit === "PACK" },
  ];
}

function ean13CheckDigit(firstTwelveDigits: string): string {
  const sum = [...firstTwelveDigits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}
