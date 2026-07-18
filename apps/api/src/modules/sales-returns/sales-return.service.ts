import { Prisma, type PrismaClient, type Product, type ProductBatch, type ProductPacking, type ReturnCondition } from "@prisma/client";
import type { CreateSalesReturnInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { applyStockMovement } from "../inventory/stock-engine.js";
import { minorToMoney } from "../products/product.service.js";
import { allocateFefoStock } from "../sales/sale.service.js";
import { AccountingPostingService, type PostingLine } from "../accounting/posting.service.js";

const reference = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const startOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };

export function remainingReturnable(sold: number, previouslyReturned: number, requested: number) {
  if (![sold, previouslyReturned, requested].every(Number.isSafeInteger) || sold < 1 || previouslyReturned < 0 || requested < 1 || requested > sold - previouslyReturned) throw new HttpError(409, "RETURN_QUANTITY_EXCEEDED", `Only ${Math.max(0, sold - previouslyReturned)} base unit(s) remain returnable.`);
  return sold - previouslyReturned - requested;
}

export function proratedReturnAmount(lineTotalMinor: number, soldQuantity: number, previouslyReturnedQuantity: number, previouslyReturnedMinor: number, requestedQuantity: number) {
  remainingReturnable(soldQuantity, previouslyReturnedQuantity, requestedQuantity);
  const cumulative = previouslyReturnedQuantity + requestedQuantity;
  return cumulative === soldQuantity ? lineTotalMinor - previouslyReturnedMinor : Math.round(lineTotalMinor * requestedQuantity / soldQuantity);
}

export function conditionWriteOff(condition: ReturnCondition) {
  if (condition === "EXPIRED") return { damageType: "EXPIRED" as const, movementType: "EXPIRY" as const };
  if (condition === "DAMAGED" || condition === "OPENED") return { damageType: "DAMAGED" as const, movementType: "DAMAGE" as const };
  return null;
}

const returnInclude = {
  sale: { select: { invoiceNumber: true, soldAt: true, saleType: true } }, customer: { select: { id: true, code: true, name: true, businessName: true, phone: true, address: true } }, createdBy: { select: { displayName: true } },
  items: { include: { product: { select: { name: true, sku: true, baseUnit: { select: { symbol: true } } } }, batch: { select: { batchNumber: true, expiryDate: true } }, saleItem: { select: { packingName: true, unitsPerPack: true } } } },
  replacementItems: { include: { product: { select: { name: true, sku: true, baseUnit: { select: { symbol: true } } } }, batch: { select: { batchNumber: true, expiryDate: true } } } },
} satisfies Prisma.SalesReturnInclude;

type ReplacementProduct = Product & { baseUnit: { symbol: string }; packings: ProductPacking[]; batches: ProductBatch[] };

export class SalesReturnService {
  constructor(private readonly db: PrismaClient) {}

  async search(invoice: string) {
    const sales = await this.db.sale.findMany({ where: { status: "POSTED", invoiceNumber: { contains: invoice } }, select: { id: true, invoiceNumber: true, soldAt: true, totalMinor: true, paidMinor: true, customer: { select: { name: true, businessName: true } }, _count: { select: { items: true, returns: true } } }, orderBy: { soldAt: "desc" }, take: 20 });
    return sales.map((sale) => ({ ...sale, total: minorToMoney(sale.totalMinor), paid: minorToMoney(sale.paidMinor) }));
  }

  async originalSale(saleId: string) {
    const sale = await this.db.sale.findFirst({ where: { id: saleId, status: "POSTED" }, include: { customer: { select: { id: true, name: true, businessName: true, code: true } }, items: { include: { product: { include: { baseUnit: true } }, batch: true, returnItems: { where: { salesReturn: { status: "POSTED" } }, select: { quantityBase: true, lineTotalMinor: true } } } } } });
    if (!sale) throw new HttpError(404, "SALE_NOT_FOUND", "Posted sale was not found.");
    return { id: sale.id, invoiceNumber: sale.invoiceNumber, soldAt: sale.soldAt, saleType: sale.saleType, paymentStatus: sale.paymentStatus, total: minorToMoney(sale.totalMinor), paid: minorToMoney(sale.paidMinor), customer: sale.customer, items: sale.items.map((item) => { const returned = item.returnItems.reduce((sum, row) => sum + row.quantityBase, 0); return { id: item.id, productId: item.productId, productName: item.product.name, sku: item.product.sku, baseUnit: item.product.baseUnit.symbol, batchNumber: item.batch?.batchNumber ?? null, batchExpiry: item.batch?.expiryDate?.toISOString() ?? null, packingName: item.packingName, unitsPerPack: item.unitsPerPack, soldQuantityBase: item.quantityBase, returnedQuantityBase: returned, remainingQuantityBase: item.quantityBase - returned, lineTotal: minorToMoney(item.lineTotalMinor) }; }).filter((item) => item.remainingQuantityBase > 0) };
  }

  async replacementOptions(search = "") {
    const products = await this.db.product.findMany({ where: { isActive: true, deletedAt: null, stockOnHandBaseQty: { gt: 0 }, ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }] } : {}) }, include: { baseUnit: true, packings: { where: { isActive: true }, orderBy: { unitsPerPack: "desc" } }, batches: { where: { stockOnHandBaseQty: { gt: 0 } } } }, orderBy: { name: "asc" }, take: 40 });
    const today = startOfToday(); return products.map((product) => { const eligibleBatch = product.batches.filter((batch) => !batch.expiryDate || batch.expiryDate >= today).reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const allBatch = product.batches.reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const available = Math.max(0, product.stockOnHandBaseQty - allBatch) + eligibleBatch; const packing = product.packings.find((row) => row.unitsPerPack > 1) ?? product.packings[0]; return packing ? { id: product.id, name: product.name, sku: product.sku, baseUnit: product.baseUnit.symbol, packUnit: packing.name, unitsPerPack: packing.unitsPerPack, retailPrice: minorToMoney(product.retailPriceMinor), wholesalePrice: minorToMoney(product.wholesalePriceMinor), availableBaseQty: available } : null; }).filter((row) => row && row.availableBaseQty > 0);
  }

  async create(input: CreateSalesReturnInput, userId: string) {
    return this.db.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: input.saleId, status: "POSTED" }, include: { customer: true, items: { include: { product: true, batch: true, returnItems: { where: { salesReturn: { status: "POSTED" } }, select: { quantityBase: true, lineTotalMinor: true } } } } } });
      if (!sale) throw new HttpError(404, "SALE_NOT_FOUND", "Posted sale was not found.");
      if (input.refundMethod === "CUSTOMER_LEDGER" && !sale.customerId) throw new HttpError(400, "CUSTOMER_REQUIRED", "A walk-in sale cannot be refunded to customer khata.");
      const saleItems = new Map(sale.items.map((item) => [item.id, item]));
      const requestedByItem = new Map<string, number>();
      for (const row of input.items) { const item = saleItems.get(row.saleItemId); if (!item) throw new HttpError(400, "INVALID_RETURN_ITEM", "A selected item does not belong to the original sale."); requestedByItem.set(row.saleItemId, (requestedByItem.get(row.saleItemId) ?? 0) + row.quantityBase); }
      for (const [id, requested] of requestedByItem) { const item = saleItems.get(id)!; remainingReturnable(item.quantityBase, item.returnItems.reduce((sum, row) => sum + row.quantityBase, 0), requested); }

      const productIds = [...new Set(input.replacementItems.map((item) => item.productId))];
      const products = await tx.product.findMany({ where: { id: { in: productIds }, isActive: true, deletedAt: null }, include: { baseUnit: { select: { symbol: true } }, packings: { where: { isActive: true }, orderBy: { unitsPerPack: "desc" } }, batches: { where: { stockOnHandBaseQty: { gt: 0 } } } } }) as ReplacementProduct[];
      if (products.length !== productIds.length) throw new HttpError(400, "INVALID_REPLACEMENT", "A replacement product is unavailable.");
      const productById = new Map(products.map((product) => [product.id, product]));
      const replacementRequests = new Map<string, number>();
      for (const row of input.replacementItems) { const product = productById.get(row.productId)!; const packing = product.packings.find((item) => item.unitsPerPack > 1) ?? product.packings[0]; if (!packing) throw new HttpError(400, "INVALID_PACKING", `Packing is missing for ${product.name}.`); const quantity = row.quantity * (row.unit === "PACK" ? packing.unitsPerPack : 1); replacementRequests.set(product.id, (replacementRequests.get(product.id) ?? 0) + quantity); }
      const replacementLines = [...replacementRequests].map(([productId, quantityBase]) => { const product = productById.get(productId)!; const unitPriceMinor = sale.saleType === "WHOLESALE" ? product.wholesalePriceMinor : product.retailPriceMinor; return { product, quantityBase, unitPriceMinor, lineTotalMinor: quantityBase * unitPriceMinor }; });
      const replacementTotalMinor = replacementLines.reduce((sum, row) => sum + row.lineTotalMinor, 0);

      let returnTotalMinor = 0; const running = new Map<string, { quantity: number; amount: number }>();
      const pricedReturns = input.items.map((row) => { const item = saleItems.get(row.saleItemId)!; const prior = running.get(item.id) ?? { quantity: item.returnItems.reduce((sum, value) => sum + value.quantityBase, 0), amount: item.returnItems.reduce((sum, value) => sum + value.lineTotalMinor, 0) }; const lineTotalMinor = proratedReturnAmount(item.lineTotalMinor, item.quantityBase, prior.quantity, prior.amount, row.quantityBase); running.set(item.id, { quantity: prior.quantity + row.quantityBase, amount: prior.amount + lineTotalMinor }); returnTotalMinor += lineTotalMinor; return { input: row, saleItem: item, lineTotalMinor }; });
      if (replacementTotalMinor > returnTotalMinor) throw new HttpError(400, "REPLACEMENT_EXCEEDS_RETURN", "Replacement value cannot exceed the returned goods value.");
      const refundMinor = returnTotalMinor - replacementTotalMinor;
      if (input.refundMethod === "CASH") { const previous = await tx.salesReturn.aggregate({ where: { saleId: sale.id, status: "POSTED", refundMethod: "CASH" }, _sum: { refundMinor: true } }); const availableCashRefund = sale.paidMinor - (previous._sum.refundMinor ?? 0); if (refundMinor > availableCashRefund) throw new HttpError(409, "CASH_REFUND_EXCEEDS_PAID", `Only ${minorToMoney(Math.max(0, availableCashRefund))} can be refunded in cash; use customer khata for the unpaid portion.`); }

      const returnedAt = new Date(); const salesReturn = await tx.salesReturn.create({ data: { returnNumber: reference("SRT"), saleId: sale.id, customerId: sale.customerId, refundMethod: input.refundMethod, totalMinor: refundMinor, returnTotalMinor, replacementTotalMinor, refundMinor, reason: input.reason, returnedAt, createdById: userId } });
      if (input.refundMethod === "CASH" && refundMinor > 0) await AccountingPostingService.assertCashDayOpen(tx, returnedAt);
      let resalableCostMinor = 0;
      for (const row of pricedReturns) {
        if (row.input.condition === "RESALABLE" && row.saleItem.batch?.expiryDate && row.saleItem.batch.expiryDate < startOfToday()) throw new HttpError(409, "EXPIRED_NOT_RESALABLE", "An expired batch cannot be returned as resalable.");
        const item = await tx.salesReturnItem.create({ data: { salesReturnId: salesReturn.id, saleItemId: row.saleItem.id, productId: row.saleItem.productId, batchId: row.saleItem.batchId, quantityBase: row.input.quantityBase, unitPriceMinor: Math.round(row.lineTotalMinor / row.input.quantityBase), lineTotalMinor: row.lineTotalMinor, condition: row.input.condition } });
        const returnCostMinor = row.saleItem.costPriceMinor * row.input.quantityBase;
        await applyStockMovement(tx, { productId: row.saleItem.productId, batchId: row.saleItem.batchId, movementType: "SALES_RETURN", quantityBase: row.input.quantityBase, unitCostMinor: row.saleItem.costPriceMinor, sourceType: "SALES_RETURN", sourceId: salesReturn.id, sourceLineId: `${item.id}:RETURN`, createdById: userId, notes: `Return ${salesReturn.returnNumber}: ${input.reason}` });
        if (row.input.condition === "RESALABLE") resalableCostMinor += returnCostMinor;
        const writeOff = conditionWriteOff(row.input.condition);
        if (writeOff) { const damage = await tx.damageEntry.create({ data: { entryNumber: reference(writeOff.damageType === "EXPIRED" ? "EXP" : "DMG"), type: writeOff.damageType, productId: row.saleItem.productId, batchId: row.saleItem.batchId, quantityBase: row.input.quantityBase, costMinor: returnCostMinor, reason: `${row.input.condition} sales return ${salesReturn.returnNumber}: ${input.reason}`, occurredAt: returnedAt, createdById: userId } }); await applyStockMovement(tx, { productId: row.saleItem.productId, batchId: row.saleItem.batchId, movementType: writeOff.movementType, quantityBase: -row.input.quantityBase, unitCostMinor: row.saleItem.costPriceMinor, sourceType: "SALES_RETURN", sourceId: salesReturn.id, sourceLineId: `${item.id}:WRITEOFF`, createdById: userId, notes: `${writeOff.damageType} entry ${damage.entryNumber}` }); }
      }
      let replacementCostMinor = 0;
      for (const line of replacementLines) { const packing = line.product.packings.find((item) => item.unitsPerPack > 1) ?? line.product.packings[0]!; const allocations = allocateFefoStock(line.product.name, line.product.stockOnHandBaseQty, line.product.batches, line.quantityBase); for (const allocation of allocations) { const unitCostMinor = line.product.averageCostMinor || allocation.batch?.purchasePriceMinor || line.product.purchasePriceMinor; replacementCostMinor += allocation.quantity * unitCostMinor; const replacement = await tx.salesReturnReplacementItem.create({ data: { salesReturnId: salesReturn.id, productId: line.product.id, batchId: allocation.batch?.id ?? null, packingName: packing.name, unitsPerPack: packing.unitsPerPack, quantityBase: allocation.quantity, unitPriceMinor: line.unitPriceMinor, lineTotalMinor: allocation.quantity * line.unitPriceMinor } }); await applyStockMovement(tx, { productId: line.product.id, batchId: allocation.batch?.id ?? null, movementType: "REPLACEMENT_OUT", quantityBase: -allocation.quantity, unitCostMinor, sourceType: "SALES_RETURN", sourceId: salesReturn.id, sourceLineId: replacement.id, createdById: userId, notes: `Replacement against ${salesReturn.returnNumber}` }); } }

      if (sale.customerId && refundMinor > 0) { await tx.customerLedger.create({ data: { customerId: sale.customerId, entryType: "SALES_RETURN", debitMinor: 0, creditMinor: refundMinor, sourceType: "SALES_RETURN", sourceId: salesReturn.id, salesReturnId: salesReturn.id, notes: `Sales return ${salesReturn.returnNumber}`, occurredAt: returnedAt, createdById: userId } }); if (input.refundMethod === "CASH") await tx.customerLedger.create({ data: { customerId: sale.customerId, entryType: "PAYMENT", debitMinor: refundMinor, creditMinor: 0, sourceType: "PAYMENT", sourceId: `${salesReturn.id}:CASH_REFUND`, salesReturnId: salesReturn.id, notes: `Cash paid for ${salesReturn.returnNumber}`, occurredAt: returnedAt, createdById: userId } }); }
      if (input.refundMethod === "CASH" && refundMinor > 0) await tx.cashbookEntry.create({ data: { entryNumber: reference("CASH"), direction: "OUT", entryType: "SALES_RETURN_REFUND", amountMinor: refundMinor, salesReturnId: salesReturn.id, sourceType: "SALES_RETURN", sourceId: salesReturn.id, notes: `Cash refund ${salesReturn.returnNumber}`, occurredAt: returnedAt, createdById: userId } });
      const settlementLine: PostingLine = input.refundMethod === "CASH" ? { systemCode: "CASH", creditMinor: refundMinor, customerId: sale.customerId } : { systemCode: "AR", creditMinor: refundMinor, customerId: sale.customerId };
      const journalLines: PostingLine[] = [
        { systemCode: "SALES_RETURNS", debitMinor: returnTotalMinor, customerId: sale.customerId },
        ...(refundMinor ? [settlementLine] : []),
        ...(replacementTotalMinor ? [{ systemCode: "SALES" as const, creditMinor: replacementTotalMinor }] : []),
        ...(resalableCostMinor ? [{ systemCode: "INVENTORY" as const, debitMinor: resalableCostMinor }, { systemCode: "COGS" as const, creditMinor: resalableCostMinor }] : []),
        ...(replacementCostMinor ? [{ systemCode: "COGS" as const, debitMinor: replacementCostMinor }, { systemCode: "INVENTORY" as const, creditMinor: replacementCostMinor }] : []),
      ];
      await AccountingPostingService.post(tx, { sourceType: "SALES_RETURN", sourceId: salesReturn.id, transactionDate: returnedAt, description: `Sales return ${salesReturn.returnNumber}`, createdById: userId, lines: journalLines });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "SalesReturn", entityId: salesReturn.id, afterJson: JSON.stringify({ returnNumber: salesReturn.returnNumber, saleId: sale.id, returnTotalMinor, replacementTotalMinor, refundMinor, refundMethod: input.refundMethod, reason: input.reason, items: input.items }) } });
      return returnDto(await tx.salesReturn.findUniqueOrThrow({ where: { id: salesReturn.id }, include: returnInclude }));
    });
  }

  async get(id: string) { const value = await this.db.salesReturn.findUnique({ where: { id }, include: returnInclude }); if (!value) throw new HttpError(404, "RETURN_NOT_FOUND", "Sales return was not found."); return returnDto(value); }
  async reverse(id: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const value = await tx.salesReturn.findUnique({ where: { id }, include: { items: { include: { saleItem: true } }, replacementItems: true, customerLedger: { include: { reversalEntry: true } }, cashbookEntries: { include: { reversalEntry: true } } } });
      if (!value) throw new HttpError(404, "RETURN_NOT_FOUND", "Sales return was not found.");
      if (value.status !== "POSTED") throw new HttpError(409, "RETURN_ALREADY_REVERSED", "Sales return is not posted.");
      const reversedAt = new Date(); if (value.cashbookEntries.length) await AccountingPostingService.assertCashDayOpen(tx, reversedAt);
      for (const item of value.items) if (item.condition === "RESALABLE") await applyStockMovement(tx, { productId: item.productId, batchId: item.batchId, movementType: "ADJUSTMENT_OUT", quantityBase: -item.quantityBase, unitCostMinor: item.saleItem.costPriceMinor, sourceType: "SALES_RETURN", sourceId: `${value.id}:REVERSAL`, sourceLineId: item.id, notes: reason, createdById: userId });
      for (const item of value.replacementItems) { const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } }); await applyStockMovement(tx, { productId: item.productId, batchId: item.batchId, movementType: "SALES_RETURN", quantityBase: item.quantityBase, unitCostMinor: product.averageCostMinor || product.purchasePriceMinor, sourceType: "SALES_RETURN", sourceId: `${value.id}:REVERSAL`, sourceLineId: `REPL:${item.id}`, notes: reason, createdById: userId }); }
      for (const entry of value.customerLedger) if (!entry.reversalEntry) await tx.customerLedger.create({ data: { customerId: entry.customerId, entryType: "REVERSAL", debitMinor: entry.creditMinor, creditMinor: entry.debitMinor, sourceType: "LEDGER_REVERSAL", sourceId: entry.id, notes: reason, reversalOfEntryId: entry.id, occurredAt: reversedAt, createdById: userId } });
      for (const cash of value.cashbookEntries) if (!cash.reversalEntry) await tx.cashbookEntry.create({ data: { entryNumber: reference("CASH"), direction: cash.direction === "IN" ? "OUT" : "IN", entryType: "ADJUSTMENT", amountMinor: cash.amountMinor, sourceType: "CASHBOOK", sourceId: cash.id, notes: reason, reversalOfId: cash.id, occurredAt: reversedAt, createdById: userId } });
      await tx.damageEntry.updateMany({ where: { reason: { contains: value.returnNumber }, status: "POSTED" }, data: { status: "VOIDED" } });
      const journal = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: "SALES_RETURN", sourceId: value.id, postingKey: "PRIMARY" } } }); if (journal) await AccountingPostingService.reverse(tx, journal.id, reason, userId, reversedAt);
      await tx.salesReturn.update({ where: { id }, data: { status: "VOIDED" } }); await tx.auditLog.create({ data: { userId, action: "REVERSE", entityType: "SalesReturn", entityId: id, beforeJson: JSON.stringify({ status: "POSTED" }), afterJson: JSON.stringify({ status: "VOIDED", reason }) } }); return { id, status: "VOIDED" as const };
    });
  }
}

type ReturnRecord = Prisma.SalesReturnGetPayload<{ include: typeof returnInclude }>;
function returnDto(value: ReturnRecord) { return { ...value, returnTotal: minorToMoney(value.returnTotalMinor), replacementTotal: minorToMoney(value.replacementTotalMinor), refund: minorToMoney(value.refundMinor), items: value.items.map((item) => ({ ...item, unitPrice: minorToMoney(item.unitPriceMinor), lineTotal: minorToMoney(item.lineTotalMinor) })), replacementItems: value.replacementItems.map((item) => ({ ...item, unitPrice: minorToMoney(item.unitPriceMinor), lineTotal: minorToMoney(item.lineTotalMinor) })) }; }
