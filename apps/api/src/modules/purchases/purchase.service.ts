import type {
  AppDbClient,
  PaymentMethod,
  SourceType,
  StockMovementType,
  BackupKind,
  JobType,
  JobStatus,
  CashDirection,
  CashbookEntryType,
  ReturnCondition,
} from "../../lib/db.js";
import type {
  CreatePurchaseInput,
  PurchaseListQuery,
  PurchasePaymentInput,
} from "@oil-agency/shared";
import { isUniqueConstraintError } from "../../lib/db-errors.js";
import { HttpError } from "../../lib/http-error.js";
import { moneyToMinor, minorToMoney } from "../products/product.service.js";
import type { TransactionClient } from "../../lib/db.js";
import {
  applyStockMovement,
  toBaseQuantity,
} from "../inventory/stock-engine.js";
import { AccountingPostingService } from "../accounting/posting.service.js";

const reference = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const dateAtNoon = (value: string) => new Date(`${value}T12:00:00.000Z`);
const paymentStatus = (paid: number, total: number) =>
  paid === 0
    ? ("UNPAID" as const)
    : paid >= total
      ? ("PAID" as const)
      : ("PARTIAL" as const);
const normalizedInvoice = (value: string) =>
  value.trim().replace(/\s+/g, " ").toUpperCase();
const normalizedBatchKey = (
  item: CreatePurchaseInput["items"][number],
  index: number,
) => item.batchId ?? (item.batchNumber.trim().toLowerCase() || `auto:${index}`);

export interface CalculatedPurchaseItem {
  cartonQuantity: number;
  pieceQuantity: number;
  quantityBase: number;
  purchaseRateMinor: number;
  unitCostMinor: number;
  lineTotalMinor: number;
}
export function calculatePurchaseLine(
  cartons: number,
  pieces: number,
  unitsPerPack: number,
  rateMinor: number,
): CalculatedPurchaseItem {
  const quantityBase = toBaseQuantity(cartons, pieces, unitsPerPack);
  if (rateMinor < 0 || !Number.isSafeInteger(rateMinor))
    throw new HttpError(400, "INVALID_RATE", "Purchase rate is invalid.");
  const lineTotalMinor =
    cartons * rateMinor + Math.round((pieces * rateMinor) / unitsPerPack);
  if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor > 2_147_483_647)
    throw new HttpError(
      400,
      "AMOUNT_TOO_LARGE",
      "Purchase line amount is too large.",
    );
  return {
    cartonQuantity: cartons,
    pieceQuantity: pieces,
    quantityBase,
    purchaseRateMinor: rateMinor,
    unitCostMinor: Math.round(lineTotalMinor / quantityBase),
    lineTotalMinor,
  };
}

const detailInclude = {
  supplier: {
    select: { id: true, code: true, name: true, phone: true, address: true },
  },
  createdBy: { select: { id: true, displayName: true, username: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          baseUnit: { select: { symbol: true } },
        },
      },
      batch: {
        select: {
          id: true,
          batchNumber: true,
          manufactureDate: true,
          expiryDate: true,
        },
      },
    },
  },
  payments: {
    include: { createdBy: { select: { displayName: true } } },
    orderBy: { paidAt: "desc" as const },
  },
} satisfies Record<string, unknown>;

export class PurchaseService {
  constructor(private readonly db: AppDbClient) {}

  async options() {
    const [suppliers, products] = await Promise.all([
      this.db.supplier.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, code: true, name: true, phone: true },
        orderBy: { name: "asc" },
      }),
      this.db.product.findMany({
        where: { isActive: true, deletedAt: null },
        include: {
          baseUnit: true,
          packings: {
            where: { isActive: true },
            include: { unit: true },
            orderBy: { unitsPerPack: "desc" },
          },
          batches: {
            select: {
              id: true,
              batchNumber: true,
              manufactureDate: true,
              expiryDate: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      suppliers,
      products: products.map((product) => {
        const packing =
          product.packings.find((item) => item.unitsPerPack > 1) ??
          product.packings[0];
        if (!packing)
          throw new HttpError(
            500,
            "PACKING_CONFIGURATION_INVALID",
            `Packing is missing for ${product.name}.`,
          );
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          purchasePrice: minorToMoney(
            product.purchasePriceMinor * packing.unitsPerPack,
          ),
          baseUnit: product.baseUnit.symbol,
          packUnit: packing.unit.symbol,
          unitsPerPack: packing.unitsPerPack,
          batches: product.batches.map((batch) => ({
            ...batch,
            manufacturingDate:
              batch.manufactureDate?.toISOString().slice(0, 10) ?? null,
            expiryDate: batch.expiryDate?.toISOString().slice(0, 10) ?? null,
          })),
        };
      }),
    };
  }

  async duplicateInvoice(
    supplierId: string,
    supplierInvoice: string,
    excludeId?: string,
  ) {
    const purchase = await this.db.purchase.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        supplierId,
        OR: [
          { supplierInvoiceNormalized: normalizedInvoice(supplierInvoice) },
          { supplierInvoice: supplierInvoice.trim() },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        purchasedAt: true,
        totalMinor: true,
      },
    });
    return {
      duplicate: Boolean(purchase),
      purchase: purchase
        ? { ...purchase, total: minorToMoney(purchase.totalMinor) }
        : null,
    };
  }

  async create(input: CreatePurchaseInput, userId: string) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: input.supplierId, isActive: true, deletedAt: null },
    });
    if (!supplier)
      throw new HttpError(
        400,
        "INVALID_SUPPLIER",
        "Selected supplier is unavailable.",
      );
    if (
      await this.db.purchase.findFirst({
        where: {
          supplierId: input.supplierId,
          OR: [
            {
              supplierInvoiceNormalized: normalizedInvoice(
                input.supplierInvoice,
              ),
            },
            { supplierInvoice: input.supplierInvoice },
          ],
        },
        select: { id: true },
      })
    )
      throw new HttpError(
        409,
        "DUPLICATE_SUPPLIER_INVOICE",
        "This supplier invoice has already been entered.",
      );
    const keys = new Set(
      input.items.map(
        (item, index) => `${item.productId}:${normalizedBatchKey(item, index)}`,
      ),
    );
    if (keys.size !== input.items.length)
      throw new HttpError(
        400,
        "DUPLICATE_PURCHASE_LINE",
        "Combine duplicate product and batch lines.",
      );

    try {
      return await this.db.$transaction(async (tx) => {
        if (
          await tx.purchase.findFirst({
            where: {
              supplierId: input.supplierId,
              OR: [
                {
                  supplierInvoiceNormalized: normalizedInvoice(
                    input.supplierInvoice,
                  ),
                },
                { supplierInvoice: input.supplierInvoice },
              ],
            },
            select: { id: true },
          })
        )
          throw new HttpError(
            409,
            "DUPLICATE_SUPPLIER_INVOICE",
            "This supplier invoice has already been entered.",
          );
        const prepared = [];
        for (const item of input.items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, isActive: true, deletedAt: null },
            include: {
              packings: {
                where: { isActive: true },
                orderBy: { unitsPerPack: "desc" },
              },
            },
          });
          if (!product)
            throw new HttpError(
              400,
              "INVALID_PRODUCT",
              "A selected product is unavailable.",
            );
          const packing =
            product.packings.find((row) => row.unitsPerPack > 1) ??
            product.packings[0];
          if (!packing)
            throw new HttpError(
              400,
              "INVALID_PACKING",
              `Packing is missing for ${product.name}.`,
            );
          if (
            packing.unitsPerPack > 1 &&
            item.pieceQuantity >= packing.unitsPerPack
          )
            throw new HttpError(
              400,
              "LOOSE_QUANTITY_TOO_LARGE",
              `Extra loose ${product.name} quantity must be less than ${packing.unitsPerPack}. Increase the ${packing.name} quantity instead.`,
            );
          const calculated = calculatePurchaseLine(
            item.cartonQuantity,
            item.pieceQuantity,
            packing.unitsPerPack,
            moneyToMinor(item.purchaseRate),
          );
          const batch = await this.resolveBatch(
            tx,
            item,
            product.id,
            calculated.unitCostMinor,
          );
          prepared.push({ input: item, product, packing, batch, calculated });
        }
        const subtotalMinor = prepared.reduce(
          (sum, item) => sum + item.calculated.lineTotalMinor,
          0,
        );
        const discountMinor = moneyToMinor(input.discount),
          taxMinor = moneyToMinor(input.tax),
          transportMinor = moneyToMinor(input.transportExpense),
          loadingMinor = moneyToMinor(input.loadingExpense),
          otherExpenseMinor = moneyToMinor(input.otherExpense);
        const totalMinor =
          subtotalMinor -
          discountMinor +
          taxMinor +
          transportMinor +
          loadingMinor +
          otherExpenseMinor;
        if (totalMinor < 0)
          throw new HttpError(
            400,
            "INVALID_TOTAL",
            "Discount cannot exceed the purchase amount and charges.",
          );
        const paidMinor = moneyToMinor(input.paidAmount);
        if (paidMinor > totalMinor)
          throw new HttpError(
            400,
            "OVERPAYMENT",
            "Paid amount cannot exceed the grand total.",
          );
        const createdAt = new Date();
        const purchase = await tx.purchase.create({
          data: {
            invoiceNumber: reference("PUR"),
            supplierInvoice: input.supplierInvoice,
            supplierInvoiceNormalized: normalizedInvoice(input.supplierInvoice),
            supplierId: input.supplierId,
            paymentStatus: paymentStatus(paidMinor, totalMinor),
            subtotalMinor,
            discountMinor,
            taxMinor,
            transportMinor,
            loadingMinor,
            otherExpenseMinor,
            totalMinor,
            paidMinor,
            dueDate: dateAtNoon(input.dueDate),
            purchasedAt: dateAtNoon(input.purchaseDate),
            notes: input.notes ?? null,
            createdById: userId,
            createdAt,
            updatedAt: createdAt,
          },
        });
        await tx.supplierLedger.create({
          data: {
            supplierId: input.supplierId,
            entryType: "PURCHASE",
            debitMinor: 0,
            creditMinor: totalMinor,
            sourceType: "PURCHASE",
            sourceId: purchase.id,
            purchaseId: purchase.id,
            notes: `Purchase ${purchase.invoiceNumber}`,
            dueDate: purchase.dueDate,
            occurredAt: purchase.purchasedAt,
            createdById: userId,
          },
        });
        const inventoryCostMinor =
          subtotalMinor -
          discountMinor +
          transportMinor +
          loadingMinor +
          otherExpenseMinor;
        const totalQuantityBase = prepared.reduce(
          (sum, row) => sum + row.calculated.quantityBase,
          0,
        );
        let allocatedMinor = 0;
        for (const [index, row] of prepared.entries()) {
          const weight =
            subtotalMinor > 0
              ? row.calculated.lineTotalMinor / subtotalMinor
              : row.calculated.quantityBase / totalQuantityBase;
          const allocatedLineCostMinor =
            index === prepared.length - 1
              ? inventoryCostMinor - allocatedMinor
              : Math.round(inventoryCostMinor * weight);
          allocatedMinor += allocatedLineCostMinor;
          const unitCostMinor = Math.round(
            allocatedLineCostMinor / row.calculated.quantityBase,
          );
          const purchaseItem = await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              productId: row.product.id,
              batchId: row.batch.id,
              packingName: row.packing.name,
              unitsPerPack: row.packing.unitsPerPack,
              packQuantity: row.calculated.cartonQuantity,
              baseQuantity: row.calculated.pieceQuantity,
              quantityBase: row.calculated.quantityBase,
              purchaseRateMinor: row.calculated.purchaseRateMinor,
              unitCostMinor,
              lineTotalMinor: row.calculated.lineTotalMinor,
            },
          });
          await applyStockMovement(tx, {
            productId: row.product.id,
            batchId: row.batch.id,
            movementType: "PURCHASE",
            quantityBase: row.calculated.quantityBase,
            unitCostMinor,
            sourceType: "PURCHASE",
            sourceId: purchase.id,
            sourceLineId: purchaseItem.id,
            notes: `Purchase ${purchase.invoiceNumber}`,
            createdById: userId,
          });
          await tx.productBatch.update({
            where: { id: row.batch.id },
            data: { purchasePriceMinor: unitCostMinor },
          });
        }
        await AccountingPostingService.post(tx, {
          sourceType: "PURCHASE",
          sourceId: purchase.id,
          transactionDate: purchase.purchasedAt,
          description: `Purchase ${purchase.invoiceNumber}`,
          createdById: userId,
          lines: [
            {
              systemCode: "INVENTORY",
              debitMinor: inventoryCostMinor,
              supplierId: purchase.supplierId,
            },
            ...(taxMinor
              ? [
                  {
                    systemCode: "INPUT_TAX" as const,
                    debitMinor: taxMinor,
                    supplierId: purchase.supplierId,
                  },
                ]
              : []),
            {
              systemCode: "AP",
              creditMinor: totalMinor,
              supplierId: purchase.supplierId,
            },
          ],
        });
        if (paidMinor > 0)
          await this.createPayment(tx, {
            purchaseId: purchase.id,
            supplierId: purchase.supplierId,
            amountMinor: paidMinor,
            method: input.paymentMethod,
            paidAt: purchase.purchasedAt,
            reference: input.paymentReference ?? null,
            notes: "Payment recorded with purchase",
            userId,
          });
        await tx.auditLog.create({
          data: {
            userId,
            action: "POST",
            entityType: "Purchase",
            entityId: purchase.id,
            afterJson: JSON.stringify({
              invoiceNumber: purchase.invoiceNumber,
              supplierInvoice: purchase.supplierInvoice,
              totalMinor,
              paidMinor,
            }),
          },
        });
        return tx.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
          include: detailInclude,
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new HttpError(
          409,
          "DUPLICATE_SUPPLIER_INVOICE",
          "This supplier invoice or generated reference already exists.",
        );
      throw error;
    }
  }

  async update(id: string, input: CreatePurchaseInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: {
          items: true,
          returns: { where: { status: "POSTED" }, select: { id: true } },
          payments: { where: { status: "POSTED" }, select: { paidAt: true } },
          supplierLedger: {
            where: { entryType: "PURCHASE" },
            include: { reversalEntry: true },
          },
        },
      });
      if (!purchase)
        throw new HttpError(
          404,
          "PURCHASE_NOT_FOUND",
          "Purchase was not found.",
        );
      if (purchase.status !== "POSTED")
        throw new HttpError(
          409,
          "PURCHASE_NOT_POSTED",
          "A deleted purchase cannot be updated.",
        );
      if (purchase.returns.length)
        throw new HttpError(
          409,
          "PURCHASE_HAS_RETURNS",
          "A purchase with posted returns cannot be updated.",
        );
      if (moneyToMinor(input.paidAmount) !== purchase.paidMinor)
        throw new HttpError(
          409,
          "PURCHASE_PAYMENT_LOCKED",
          "Use purchase payments to change the paid amount.",
        );
      if (purchase.paidMinor > 0 && input.supplierId !== purchase.supplierId)
        throw new HttpError(
          409,
          "PURCHASE_SUPPLIER_LOCKED",
          "The supplier cannot be changed after a payment has been recorded.",
        );
      const revisedPurchaseDate = dateAtNoon(input.purchaseDate);
      if (
        purchase.payments.some(
          (payment) => payment.paidAt < revisedPurchaseDate,
        )
      )
        throw new HttpError(
          400,
          "INVALID_PURCHASE_DATE",
          "Purchase date cannot be after an existing payment date.",
        );

      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, isActive: true, deletedAt: null },
      });
      if (!supplier)
        throw new HttpError(
          400,
          "INVALID_SUPPLIER",
          "Selected supplier is unavailable.",
        );
      const duplicate = await tx.purchase.findFirst({
        where: {
          id: { not: id },
          supplierId: input.supplierId,
          OR: [
            {
              supplierInvoiceNormalized: normalizedInvoice(
                input.supplierInvoice,
              ),
            },
            { supplierInvoice: input.supplierInvoice.trim() },
          ],
        },
        select: { id: true },
      });
      if (duplicate)
        throw new HttpError(
          409,
          "DUPLICATE_SUPPLIER_INVOICE",
          "This supplier invoice has already been entered.",
        );
      const keys = new Set(
        input.items.map(
          (item, index) =>
            `${item.productId}:${normalizedBatchKey(item, index)}`,
        ),
      );
      if (keys.size !== input.items.length)
        throw new HttpError(
          400,
          "DUPLICATE_PURCHASE_LINE",
          "Combine duplicate product and batch lines.",
        );

      const prepared = [];
      for (const item of input.items) {
        const product = await tx.product.findFirst({
          where: { id: item.productId, isActive: true, deletedAt: null },
          include: {
            packings: {
              where: { isActive: true },
              orderBy: { unitsPerPack: "desc" },
            },
          },
        });
        if (!product)
          throw new HttpError(
            400,
            "INVALID_PRODUCT",
            "A selected product is unavailable.",
          );
        const packing =
          product.packings.find((row) => row.unitsPerPack > 1) ??
          product.packings[0];
        if (!packing)
          throw new HttpError(
            400,
            "INVALID_PACKING",
            `Packing is missing for ${product.name}.`,
          );
        if (
          packing.unitsPerPack > 1 &&
          item.pieceQuantity >= packing.unitsPerPack
        )
          throw new HttpError(
            400,
            "LOOSE_QUANTITY_TOO_LARGE",
            `Extra loose ${product.name} quantity must be less than ${packing.unitsPerPack}. Increase the ${packing.name} quantity instead.`,
          );
        const calculated = calculatePurchaseLine(
          item.cartonQuantity,
          item.pieceQuantity,
          packing.unitsPerPack,
          moneyToMinor(item.purchaseRate),
        );
        const batch = await this.resolveBatch(
          tx,
          item,
          product.id,
          calculated.unitCostMinor,
        );
        prepared.push({ product, packing, batch, calculated });
      }

      const subtotalMinor = prepared.reduce(
        (sum, item) => sum + item.calculated.lineTotalMinor,
        0,
      );
      const discountMinor = moneyToMinor(input.discount),
        taxMinor = moneyToMinor(input.tax),
        transportMinor = moneyToMinor(input.transportExpense),
        loadingMinor = moneyToMinor(input.loadingExpense),
        otherExpenseMinor = moneyToMinor(input.otherExpense);
      const totalMinor =
        subtotalMinor -
        discountMinor +
        taxMinor +
        transportMinor +
        loadingMinor +
        otherExpenseMinor;
      if (totalMinor < 0)
        throw new HttpError(
          400,
          "INVALID_TOTAL",
          "Discount cannot exceed the purchase amount and charges.",
        );
      if (purchase.paidMinor > totalMinor)
        throw new HttpError(
          400,
          "OVERPAYMENT",
          "The revised total cannot be less than payments already recorded.",
        );

      const changedAt = new Date();
      const revision = reference("EDIT");
      const currentJournal = await tx.journalEntry.findFirst({
        where: { sourceType: "PURCHASE", sourceId: id, status: "POSTED" },
        orderBy: { createdAt: "desc" },
      });
      if (currentJournal)
        await AccountingPostingService.reverse(
          tx,
          currentJournal.id,
          `Purchase ${purchase.invoiceNumber} updated`,
          userId,
          changedAt,
        );
      for (const entry of purchase.supplierLedger)
        if (!entry.reversalEntry)
          await tx.supplierLedger.create({
            data: {
              supplierId: entry.supplierId,
              entryType: "REVERSAL",
              debitMinor: entry.creditMinor,
              creditMinor: entry.debitMinor,
              sourceType: "SUPPLIER_LEDGER_REVERSAL",
              sourceId: entry.id,
              notes: `Purchase ${purchase.invoiceNumber} updated`,
              reversalOfEntryId: entry.id,
              occurredAt: changedAt,
              createdById: userId,
            },
          });
      for (const item of purchase.items)
        await applyStockMovement(tx, {
          productId: item.productId,
          batchId: item.batchId,
          movementType: "PURCHASE_RETURN",
          quantityBase: -item.quantityBase,
          unitCostMinor: item.unitCostMinor,
          sourceType: "PURCHASE",
          sourceId: revision,
          sourceLineId: `OLD-${item.id}`,
          notes: `Update purchase ${purchase.invoiceNumber}`,
          createdById: userId,
        });
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          supplierInvoice: input.supplierInvoice,
          supplierInvoiceNormalized: normalizedInvoice(input.supplierInvoice),
          supplierId: input.supplierId,
          paymentStatus: paymentStatus(purchase.paidMinor, totalMinor),
          subtotalMinor,
          discountMinor,
          taxMinor,
          transportMinor,
          loadingMinor,
          otherExpenseMinor,
          totalMinor,
          dueDate: dateAtNoon(input.dueDate),
          purchasedAt: revisedPurchaseDate,
          notes: input.notes ?? null,
          updatedAt: changedAt,
        },
      });
      await tx.supplierLedger.create({
        data: {
          supplierId: input.supplierId,
          entryType: "PURCHASE",
          debitMinor: 0,
          creditMinor: totalMinor,
          sourceType: "PURCHASE",
          sourceId: revision,
          purchaseId: id,
          notes: `Updated purchase ${purchase.invoiceNumber}`,
          dueDate: updated.dueDate,
          occurredAt: updated.purchasedAt,
          createdById: userId,
        },
      });

      const inventoryCostMinor =
        subtotalMinor -
        discountMinor +
        transportMinor +
        loadingMinor +
        otherExpenseMinor;
      const totalQuantityBase = prepared.reduce(
        (sum, row) => sum + row.calculated.quantityBase,
        0,
      );
      let allocatedMinor = 0;
      for (const [index, row] of prepared.entries()) {
        const weight =
          subtotalMinor > 0
            ? row.calculated.lineTotalMinor / subtotalMinor
            : row.calculated.quantityBase / totalQuantityBase;
        const allocatedLineCostMinor =
          index === prepared.length - 1
            ? inventoryCostMinor - allocatedMinor
            : Math.round(inventoryCostMinor * weight);
        allocatedMinor += allocatedLineCostMinor;
        const unitCostMinor = Math.round(
          allocatedLineCostMinor / row.calculated.quantityBase,
        );
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: id,
            productId: row.product.id,
            batchId: row.batch.id,
            packingName: row.packing.name,
            unitsPerPack: row.packing.unitsPerPack,
            packQuantity: row.calculated.cartonQuantity,
            baseQuantity: row.calculated.pieceQuantity,
            quantityBase: row.calculated.quantityBase,
            purchaseRateMinor: row.calculated.purchaseRateMinor,
            unitCostMinor,
            lineTotalMinor: row.calculated.lineTotalMinor,
          },
        });
        await applyStockMovement(tx, {
          productId: row.product.id,
          batchId: row.batch.id,
          movementType: "PURCHASE",
          quantityBase: row.calculated.quantityBase,
          unitCostMinor,
          sourceType: "PURCHASE",
          sourceId: revision,
          sourceLineId: purchaseItem.id,
          notes: `Updated purchase ${purchase.invoiceNumber}`,
          createdById: userId,
        });
        await tx.productBatch.update({
          where: { id: row.batch.id },
          data: { purchasePriceMinor: unitCostMinor },
        });
      }
      await AccountingPostingService.post(tx, {
        sourceType: "PURCHASE",
        sourceId: id,
        postingKey: revision,
        transactionDate: updated.purchasedAt,
        description: `Updated purchase ${purchase.invoiceNumber}`,
        createdById: userId,
        lines: [
          {
            systemCode: "INVENTORY",
            debitMinor: inventoryCostMinor,
            supplierId: input.supplierId,
          },
          ...(taxMinor
            ? [
                {
                  systemCode: "INPUT_TAX" as const,
                  debitMinor: taxMinor,
                  supplierId: input.supplierId,
                },
              ]
            : []),
          {
            systemCode: "AP",
            creditMinor: totalMinor,
            supplierId: input.supplierId,
          },
        ],
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "UPDATE",
          entityType: "Purchase",
          entityId: id,
          beforeJson: JSON.stringify({
            supplierId: purchase.supplierId,
            supplierInvoice: purchase.supplierInvoice,
            totalMinor: purchase.totalMinor,
          }),
          afterJson: JSON.stringify({
            supplierId: input.supplierId,
            supplierInvoice: input.supplierInvoice,
            totalMinor,
          }),
        },
      });
      return tx.purchase.findUniqueOrThrow({
        where: { id },
        include: detailInclude,
      });
    });
  }

  async list(query: PurchaseListQuery) {
    const where: Record<string, unknown> = {
      status: "POSTED",
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search } },
              { supplierInvoice: { contains: query.search } },
              { supplier: { name: { contains: query.search } } },
            ],
          }
        : {}),
    };
    const [purchases, total] = await this.db.$transaction([
      this.db.purchase.findMany({
        where,
        include: {
          supplier: { select: { name: true, code: true } },
          createdBy: { select: { displayName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { purchasedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.purchase.count({ where }),
    ]);
    return {
      purchases: purchases.map((purchase) => ({
        ...purchase,
        subtotal: minorToMoney(purchase.subtotalMinor),
        total: minorToMoney(purchase.totalMinor),
        paid: minorToMoney(purchase.paidMinor),
        due: minorToMoney(purchase.totalMinor - purchase.paidMinor),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async get(id: string) {
    const purchase = await this.db.purchase.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!purchase)
      throw new HttpError(404, "PURCHASE_NOT_FOUND", "Purchase was not found.");
    return {
      ...purchase,
      subtotal: minorToMoney(purchase.subtotalMinor),
      discount: minorToMoney(purchase.discountMinor),
      tax: minorToMoney(purchase.taxMinor),
      transportExpense: minorToMoney(purchase.transportMinor),
      loadingExpense: minorToMoney(purchase.loadingMinor),
      otherExpense: minorToMoney(purchase.otherExpenseMinor),
      total: minorToMoney(purchase.totalMinor),
      paid: minorToMoney(purchase.paidMinor),
      due: minorToMoney(purchase.totalMinor - purchase.paidMinor),
      items: purchase.items.map((item) => ({
        ...item,
        purchaseRate: minorToMoney(item.purchaseRateMinor),
        lineTotal: minorToMoney(item.lineTotalMinor),
      })),
      payments: purchase.payments.map((payment) => ({
        ...payment,
        amount: minorToMoney(payment.amountMinor),
      })),
    };
  }

  async pay(id: string, input: PurchasePaymentInput, userId: string) {
    const amountMinor = moneyToMinor(input.amount);
    if (amountMinor <= 0)
      throw new HttpError(
        400,
        "INVALID_PAYMENT",
        "Payment amount must be greater than zero.",
      );
    return this.db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } });
      if (!purchase)
        throw new HttpError(
          404,
          "PURCHASE_NOT_FOUND",
          "Purchase was not found.",
        );
      if (purchase.status !== "POSTED")
        throw new HttpError(
          409,
          "PURCHASE_NOT_POSTED",
          "Only posted purchases can be paid.",
        );
      const paidAt = dateAtNoon(input.paidAt);
      if (paidAt < purchase.purchasedAt)
        throw new HttpError(
          400,
          "INVALID_PAYMENT_DATE",
          "Payment date cannot be before the purchase date.",
        );
      const due = purchase.totalMinor - purchase.paidMinor;
      if (amountMinor > due)
        throw new HttpError(
          400,
          "OVERPAYMENT",
          "Payment exceeds the outstanding amount.",
        );
      const payment = await this.createPayment(tx, {
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        amountMinor,
        method: input.method,
        paidAt,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId,
      });
      const newPaid = purchase.paidMinor + amountMinor;
      await tx.purchase.update({
        where: { id },
        data: {
          paidMinor: newPaid,
          paymentStatus: paymentStatus(newPaid, purchase.totalMinor),
          updatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "POST",
          entityType: "PurchasePayment",
          entityId: payment.id,
          afterJson: JSON.stringify({ purchaseId: id, amountMinor }),
        },
      });
      return payment;
    });
  }

  async void(id: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: {
          items: true,
          returns: { where: { status: "POSTED" }, select: { id: true } },
          payments: { include: { cashbookEntries: true } },
          supplierLedger: { include: { reversalEntry: true } },
        },
      });
      if (!purchase)
        throw new HttpError(
          404,
          "PURCHASE_NOT_FOUND",
          "Purchase was not found.",
        );
      if (purchase.status !== "POSTED")
        throw new HttpError(
          409,
          "PURCHASE_ALREADY_VOIDED",
          "Purchase is not posted.",
        );
      if (purchase.returns.length)
        throw new HttpError(
          409,
          "PURCHASE_HAS_RETURNS",
          "A purchase with posted returns cannot be voided.",
        );
      const reversedAt = new Date();
      if (purchase.payments.some((payment) => payment.method === "CASH"))
        await AccountingPostingService.assertCashDayOpen(tx, reversedAt);
      for (const item of purchase.items)
        await applyStockMovement(tx, {
          productId: item.productId,
          batchId: item.batchId,
          movementType: "PURCHASE_RETURN",
          quantityBase: -item.quantityBase,
          unitCostMinor: item.unitCostMinor,
          sourceType: "PURCHASE",
          sourceId: `${purchase.id}:VOID`,
          sourceLineId: item.id,
          notes: `Void purchase: ${reason}`,
          createdById: userId,
        });
      for (const entry of purchase.supplierLedger)
        if (entry.entryType !== "REVERSAL" && !entry.reversalEntry)
          await tx.supplierLedger.create({
            data: {
              supplierId: entry.supplierId,
              entryType: "REVERSAL",
              debitMinor: entry.creditMinor,
              creditMinor: entry.debitMinor,
              sourceType: "SUPPLIER_LEDGER_REVERSAL",
              sourceId: entry.id,
              notes: `Purchase void: ${reason}`,
              reversalOfEntryId: entry.id,
              occurredAt: reversedAt,
              createdById: userId,
            },
          });
      for (const payment of purchase.payments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "VOIDED" },
        });
        await tx.payment.create({
          data: {
            receiptNumber: reference("REV"),
            direction: "IN",
            partyType: payment.partyType,
            supplierId: payment.supplierId,
            purchaseId: purchase.id,
            method: payment.method,
            bankAccountId: payment.bankAccountId,
            amountMinor: payment.amountMinor,
            reference: payment.receiptNumber,
            notes: reason,
            paidAt: reversedAt,
            createdById: userId,
            reversalOfId: payment.id,
          },
        });
        for (const cash of payment.cashbookEntries)
          await tx.cashbookEntry.create({
            data: {
              entryNumber: reference("CASH"),
              direction: cash.direction === "IN" ? "OUT" : "IN",
              entryType: "ADJUSTMENT",
              amountMinor: cash.amountMinor,
              sourceType: "CASHBOOK",
              sourceId: cash.id,
              notes: `Reversal of ${cash.entryNumber}: ${reason}`,
              occurredAt: reversedAt,
              createdById: userId,
              reversalOfId: cash.id,
            },
          });
        const paymentJournal = await tx.journalEntry.findUnique({
          where: {
            sourceType_sourceId_postingKey: {
              sourceType: "PAYMENT",
              sourceId: payment.id,
              postingKey: "PRIMARY",
            },
          },
        });
        if (paymentJournal)
          await AccountingPostingService.reverse(
            tx,
            paymentJournal.id,
            reason,
            userId,
            reversedAt,
          );
      }
      const journal = await tx.journalEntry.findFirst({
        where: {
          sourceType: "PURCHASE",
          sourceId: purchase.id,
          status: "POSTED",
        },
        orderBy: { createdAt: "desc" },
      });
      if (journal)
        await AccountingPostingService.reverse(
          tx,
          journal.id,
          reason,
          userId,
          reversedAt,
        );
      await tx.purchase.update({
        where: { id },
        data: { status: "VOIDED", updatedAt: reversedAt },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "VOID",
          entityType: "Purchase",
          entityId: id,
          beforeJson: JSON.stringify({ status: "POSTED" }),
          afterJson: JSON.stringify({ status: "VOIDED", reason }),
        },
      });
      return { id, status: "VOIDED" as const };
    });
  }

  private async resolveBatch(
    tx: TransactionClient,
    item: CreatePurchaseInput["items"][number],
    productId: string,
    purchasePriceMinor: number,
  ) {
    const manufactureDate = item.manufacturingDate
        ? dateAtNoon(item.manufacturingDate)
        : null,
      expiryDate = item.expiryDate ? dateAtNoon(item.expiryDate) : null;
    const requestedBatchNumber = item.batchNumber.trim();
    const batchNumber =
      requestedBatchNumber || (await this.nextBatchNumber(tx, productId));
    const existing = item.batchId
      ? await tx.productBatch.findFirst({
          where: { id: item.batchId, productId },
        })
      : await tx.productBatch.findUnique({
          where: { productId_batchNumber: { productId, batchNumber } },
        });
    if (item.batchId && !existing)
      throw new HttpError(
        400,
        "INVALID_BATCH",
        "Selected batch does not belong to the product.",
      );
    if (existing) {
      if (requestedBatchNumber && existing.batchNumber !== requestedBatchNumber)
        throw new HttpError(
          400,
          "BATCH_NUMBER_MISMATCH",
          "Selected batch number does not match.",
        );
      if (
        (manufactureDate &&
          existing.manufactureDate?.valueOf() !== manufactureDate.valueOf()) ||
        (expiryDate && existing.expiryDate?.valueOf() !== expiryDate.valueOf())
      )
        throw new HttpError(
          409,
          "BATCH_DATE_CONFLICT",
          "Manufacturing or expiry date conflicts with the existing batch.",
        );
      return existing;
    }
    return tx.productBatch.create({
      data: {
        productId,
        batchNumber,
        manufactureDate,
        expiryDate,
        purchasePriceMinor,
        stockOnHandBaseQty: 0,
      },
    });
  }

  private async nextBatchNumber(tx: TransactionClient, productId: string) {
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const batchNumber = `BATCH-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const existing = await tx.productBatch.findUnique({
        where: { productId_batchNumber: { productId, batchNumber } },
        select: { id: true },
      });
      if (!existing) return batchNumber;
    }
    throw new HttpError(
      500,
      "BATCH_NUMBER_GENERATION_FAILED",
      "Could not generate a unique batch number.",
    );
  }

  private async createPayment(
    tx: TransactionClient,
    data: {
      purchaseId: string;
      supplierId: string;
      amountMinor: number;
      method: PaymentMethod;
      paidAt: Date;
      reference: string | null;
      notes: string | null;
      userId: string;
    },
  ) {
    if (data.method === "CASH")
      await AccountingPostingService.assertCashDayOpen(tx, data.paidAt);
    const payment = await tx.payment.create({
      data: {
        receiptNumber: reference("PAY"),
        direction: "OUT",
        partyType: "SUPPLIER",
        supplierId: data.supplierId,
        purchaseId: data.purchaseId,
        method: data.method,
        amountMinor: data.amountMinor,
        paidAt: data.paidAt,
        reference: data.reference,
        notes: data.notes,
        createdById: data.userId,
      },
    });
    await tx.supplierLedger.create({
      data: {
        supplierId: data.supplierId,
        entryType: "PAYMENT",
        debitMinor: data.amountMinor,
        creditMinor: 0,
        sourceType: "PAYMENT",
        sourceId: payment.id,
        purchaseId: data.purchaseId,
        paymentId: payment.id,
        notes: `Payment ${payment.receiptNumber}`,
        occurredAt: data.paidAt,
        createdById: data.userId,
      },
    });
    if (data.method === "CASH")
      await tx.cashbookEntry.create({
        data: {
          entryNumber: reference("CASH"),
          direction: "OUT",
          entryType: "SUPPLIER_PAYMENT",
          amountMinor: data.amountMinor,
          paymentId: payment.id,
          sourceType: "PAYMENT",
          sourceId: payment.id,
          reference: payment.receiptNumber,
          notes: data.notes,
          occurredAt: data.paidAt,
          createdById: data.userId,
        },
      });
    const tenderAccountId = await AccountingPostingService.tenderAccountId(
      tx,
      data.method,
      payment.bankAccountId,
    );
    await AccountingPostingService.post(tx, {
      sourceType: "PAYMENT",
      sourceId: payment.id,
      transactionDate: data.paidAt,
      description: `Supplier payment ${payment.receiptNumber}`,
      createdById: data.userId,
      lines: [
        {
          systemCode: "AP",
          debitMinor: data.amountMinor,
          supplierId: data.supplierId,
        },
        {
          accountId: tenderAccountId,
          creditMinor: data.amountMinor,
          supplierId: data.supplierId,
        },
      ],
    });
    return payment;
  }
}
