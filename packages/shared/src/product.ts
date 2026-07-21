import { z } from "zod";

export const PRODUCT_TYPES = ["OIL", "GHEE", "OTHER"] as const;
export const SIZE_UNITS = ["MILLILITER", "LITER", "GRAM", "KILOGRAM"] as const;
export const PACKING_MODES = ["BASE", "PACK"] as const;
export const INDIVIDUAL_UNIT_NAMES = [
  "Tin",
  "Balti",
  "Bottle",
  "Pouch",
] as const;
export const OUTER_PACK_UNIT_NAMES = ["Tray", "Box", "Carton", "Pack"] as const;

export function isIndividualUnit(unit: {
  name: string;
  symbol?: string | undefined;
}) {
  const value = `${unit.name} ${unit.symbol ?? ""}`.toLowerCase();
  return ["tin", "balti", "bottle", "btl", "pouch"].some((unitName) =>
    value.split(/\s+/).includes(unitName),
  );
}

export function isOuterPackUnit(unit: {
  name: string;
  symbol?: string | undefined;
}) {
  const value = `${unit.name} ${unit.symbol ?? ""}`.toLowerCase();
  return ["tray", "box", "carton", "ctn", "pack"].some((unitName) =>
    value.split(/\s+/).includes(unitName),
  );
}

const optionalIdSchema = z.string().trim().min(1).max(64).nullable();
const moneySchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,8}(\.\d{1,2})?$/,
    "Enter a valid amount with up to 2 decimal places.",
  );
const percentageSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a valid percentage.")
  .refine((value) => Number(value) <= 100, "Percentage cannot exceed 100.");
const barcodeSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^\d*$/, "Barcode may contain digits only.");

export const productFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    brandId: optionalIdSchema,
    categoryId: optionalIdSchema,
    productType: z.enum(PRODUCT_TYPES),
    sizeValue: z.number().positive().max(1_000_000).nullable(),
    sizeUnit: z.enum(SIZE_UNITS).nullable(),
    baseUnitId: z.string().trim().min(1).max(64),
    packUnitId: z.string().trim().min(1).max(64),
    unitsPerPack: z.number().int().min(1).max(100_000),
    purchaseUnit: z.enum(PACKING_MODES),
    saleUnit: z.enum(PACKING_MODES),
    sku: z
      .string()
      .trim()
      .max(50)
      .regex(
        /^$|^[A-Za-z0-9._-]{2,50}$/,
        "SKU may contain letters, numbers, dots, underscores, and hyphens.",
      )
      .transform((value) => value.toUpperCase()),
    barcode: barcodeSchema,
    purchasePrice: moneySchema,
    retailPrice: moneySchema,
    wholesalePrice: moneySchema,
    minimumPrice: moneySchema,
    taxRatePercent: percentageSchema,
    fbrHsCode: z.string().trim().max(20).regex(/^$|^\d{4}\.\d{4}$/, "HS code must look like 1511.9090.").default(""),
    fbrUom: z.string().trim().min(1).max(100).default("Numbers, pieces, units"),
    fbrSaleType: z.string().trim().min(1).max(160).default("Goods at standard rate (default)"),
    fbrFixedNotifiedValue: moneySchema.default("0.00"),
    fbrSroScheduleNo: z.string().trim().max(80).default(""),
    fbrSroItemSerialNo: z.string().trim().max(80).default(""),
    reorderLevelBaseQty: z.number().int().min(0).max(100_000_000),
    rackLocation: z.string().trim().max(80),
    notes: z.string().trim().max(500),
    isActive: z.boolean(),
  })
  .superRefine((value, context) => {
    if ((value.sizeValue === null) !== (value.sizeUnit === null))
      context.addIssue({
        code: "custom",
        path: ["sizeValue"],
        message: "Size value and unit must both be provided.",
      });
    if (value.unitsPerPack === 1 && value.baseUnitId !== value.packUnitId)
      context.addIssue({
        code: "custom",
        path: ["packUnitId"],
        message:
          "Individual-only products must use the individual item as their packing unit.",
      });
    if (value.unitsPerPack > 1 && value.baseUnitId === value.packUnitId)
      context.addIssue({
        code: "custom",
        path: ["packUnitId"],
        message: "Outer packing must be different from the individual item.",
      });
    if (Number(value.minimumPrice) > Number(value.retailPrice))
      context.addIssue({
        code: "custom",
        path: ["minimumPrice"],
        message: "Minimum price cannot exceed retail price.",
      });
  });

export const createProductInputSchema = productFieldsSchema.and(
  z.object({
    openingStockPackQty: z.number().int().min(0).max(10_000_000),
    openingStockBaseQty: z.number().int().min(0).max(100_000_000),
  }),
);

export const updateProductInputSchema = productFieldsSchema;

export const productListQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  categoryId: z.string().trim().max(64).optional(),
  brandId: z.string().trim().max(64).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  active: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const productIdSchema = z.string().trim().min(1).max(64);
export const generateSkuQuerySchema = z.object({
  name: z.string().trim().min(2).max(120),
  sizeValue: z.coerce.number().positive().max(1_000_000).optional(),
  sizeUnit: z.enum(SIZE_UNITS).optional(),
  baseUnitId: z.string().trim().max(64).optional(),
});
export type GenerateSkuQuery = z.infer<typeof generateSkuQuerySchema>;

export type CreateProductInput = z.infer<typeof createProductInputSchema>;
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export type SizeUnit = (typeof SIZE_UNITS)[number];
export type PackingMode = (typeof PACKING_MODES)[number];

export interface ProductOption {
  id: string;
  name: string;
  symbol?: string;
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  productType: ProductType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  category: ProductOption | null;
  brand: ProductOption | null;
  baseUnit: ProductOption;
  packUnit: ProductOption;
  unitsPerPack: number;
  purchaseUnit: PackingMode;
  saleUnit: PackingMode;
  purchasePrice: string;
  retailPrice: string;
  wholesalePrice: string;
  minimumPrice: string;
  taxRatePercent: string;
  fbrHsCode: string;
  fbrUom: string;
  fbrSaleType: string;
  fbrFixedNotifiedValue: string;
  fbrSroScheduleNo: string;
  fbrSroItemSerialNo: string;
  reorderLevelBaseQty: number;
  stockOnHandBaseQty: number;
  rackLocation: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
