import { Prisma, type PrismaClient, type Product, type ProductBatch, type ProductPacking } from "@prisma/client";
import type { CheckoutInput, HoldSaleInput } from "@oil-agency/shared";
import { hashToken } from "../../lib/security.js";
import { HttpError } from "../../lib/http-error.js";
import { applyStockMovement, type TransactionClient } from "../inventory/stock-engine.js";
import { moneyToMinor, minorToMoney } from "../products/product.service.js";
import { SalePaymentService } from "./sale-payment.service.js";
import { AccountingPostingService, type PostingLine } from "../accounting/posting.service.js";

const number = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const statusFor = (paid: number, total: number) => paid >= total ? "PAID" as const : paid === 0 ? "UNPAID" as const : "PARTIAL" as const;
const today = () => { const value = new Date(); value.setHours(0, 0, 0, 0); return value; };
type LoadedProduct = Product & { category: { id: string; name: string } | null; baseUnit: { symbol: string }; packings: ProductPacking[]; batches: ProductBatch[] };
type Actor = { id: string; role: string; cashierDiscountLimitBps: number };

const invoiceInclude = {
  customer: { select: { id: true, code: true, name: true, phone: true, address: true } }, createdBy: { select: { displayName: true, username: true } },
  items: { include: { product: { select: { name: true, sku: true, baseUnit: { select: { symbol: true } } } }, batch: { select: { batchNumber: true, expiryDate: true } } } },
  payments: { select: { receiptNumber: true, method: true, amountMinor: true, reference: true, paidAt: true } },
} satisfies Prisma.SaleInclude;

export interface SaleCalculation { subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number }
export function calculateSaleTotals(lines: Array<{ grossMinor: number; taxRateBps: number }>, discountBps: number): SaleCalculation {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.grossMinor, 0);
  const discountMinor = Math.round(subtotalMinor * discountBps / 10_000);
  const taxMinor = lines.reduce((sum, line) => { const lineDiscount = Math.round(line.grossMinor * discountBps / 10_000); return sum + Math.round((line.grossMinor - lineDiscount) * line.taxRateBps / 10_000); }, 0);
  const totalMinor = subtotalMinor - discountMinor + taxMinor;
  if (![subtotalMinor, discountMinor, taxMinor, totalMinor].every(Number.isSafeInteger) || totalMinor > 2_147_483_647) throw new HttpError(400, "SALE_AMOUNT_TOO_LARGE", "Sale amount exceeds the supported limit.");
  return { subtotalMinor, discountMinor, taxMinor, totalMinor };
}
export function allocateFefoStock(productName: string, totalStock: number, batches: ProductBatch[], required: number, businessDate = today()) {
  const allBatchStock = batches.reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const unbatched = Math.max(0, totalStock - allBatchStock); const eligible = batches.filter((batch) => !batch.expiryDate || batch.expiryDate >= businessDate).sort(fefo); const available = unbatched + eligible.reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); if (available < required) throw new HttpError(409, "NEGATIVE_STOCK", `Insufficient available stock for ${productName}.`); let remaining = required; const allocations: Array<{ batch: ProductBatch | null; quantity: number }> = []; for (const batch of eligible) { if (!remaining) break; const quantity = Math.min(remaining, batch.stockOnHandBaseQty); if (quantity) allocations.push({ batch, quantity }); remaining -= quantity; } if (remaining) allocations.push({ batch: null, quantity: remaining }); return allocations;
}
export function calculateInvoiceBalances(previousBalanceMinor: number, dueMinor: number) { if (![previousBalanceMinor, dueMinor].every(Number.isSafeInteger) || dueMinor < 0) throw new HttpError(400, "INVALID_BALANCE", "Invoice balance values are invalid."); return { previousBalanceMinor, currentBalanceMinor: previousBalanceMinor + dueMinor }; }

export class SaleService {
  private readonly payments = new SalePaymentService();
  constructor(private readonly db: PrismaClient) {}

  async options() { const [categories, customers] = await Promise.all([this.db.category.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }), this.db.customer.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, code: true, name: true, phone: true }, orderBy: { name: "asc" } })]); const ledger = await this.db.customerLedger.findMany({ where: { customerId: { in: customers.map((customer) => customer.id) } }, select: { customerId: true, debitMinor: true, creditMinor: true } }); return { categories, customers: customers.map((customer) => { const balanceMinor = ledger.filter((entry) => entry.customerId === customer.id).reduce((sum, entry) => sum + entry.debitMinor - entry.creditMinor, 0); return { id: customer.id, code: customer.code, name: customer.name, phone: customer.phone, balance: minorToMoney(balanceMinor) }; }) }; }

  async search(search: string, categoryId?: string, limit = 40) {
    const products = await this.db.product.findMany({ where: { isActive: true, deletedAt: null, ...(categoryId ? { categoryId } : {}), ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }, { packings: { some: { barcode: { contains: search } } } }] } : {}) }, include: { category: { select: { id: true, name: true } }, baseUnit: { select: { symbol: true } }, packings: { where: { isActive: true }, include: { unit: { select: { symbol: true } } }, orderBy: { unitsPerPack: "desc" } }, batches: { where: { stockOnHandBaseQty: { gt: 0 } } } }, orderBy: { name: "asc" }, take: limit });
    const start = today(); return products.map((product) => { const eligible = product.batches.filter((batch) => !batch.expiryDate || batch.expiryDate >= start).sort(fefo); const batched = product.batches.reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const expiredBaseQty = product.batches.filter((batch) => batch.expiryDate && batch.expiryDate < start).reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const unbatched = Math.max(0, product.stockOnHandBaseQty - batched); const availableBaseQty = unbatched + eligible.reduce((sum, batch) => sum + batch.stockOnHandBaseQty, 0); const packing = product.packings.find((item) => item.unitsPerPack > 1) ?? product.packings[0]; if (!packing) throw new HttpError(500, "PACKING_CONFIGURATION_INVALID", `Packing is missing for ${product.name}.`); const suggested = eligible[0]; return { id: product.id, name: product.name, sku: product.sku, barcode: product.barcode, categoryId: product.category?.id ?? null, categoryName: product.category?.name ?? null, baseUnit: product.baseUnit.symbol, packUnit: packing.unit.symbol, unitsPerPack: packing.unitsPerPack, retailPrice: minorToMoney(product.retailPriceMinor), wholesalePrice: minorToMoney(product.wholesalePriceMinor), taxRateBps: product.taxRateBps, stockBaseQty: product.stockOnHandBaseQty, availableBaseQty, expiredBaseQty, suggestedBatch: suggested ? { id: suggested.id, batchNumber: suggested.batchNumber, expiryDate: suggested.expiryDate?.toISOString() ?? null, stockBaseQty: suggested.stockOnHandBaseQty } : null }; });
  }

  async checkout(input: CheckoutInput, actor: Actor) {
    const customer = input.customerId ? await this.db.customer.findFirst({ where: { id: input.customerId, isActive: true, deletedAt: null } }) : null;
    if (input.customerId && !customer) throw new HttpError(400, "INVALID_CUSTOMER", "Selected customer is unavailable.");
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await this.db.product.findMany({ where: { id: { in: productIds }, isActive: true, deletedAt: null }, include: { category: { select: { id: true, name: true } }, baseUnit: { select: { symbol: true } }, packings: { where: { isActive: true }, orderBy: { unitsPerPack: "desc" } }, batches: { where: { stockOnHandBaseQty: { gt: 0 } } } } }) as LoadedProduct[];
    if (products.length !== productIds.length) throw new HttpError(400, "INVALID_PRODUCT", "A cart product is unavailable.");
    const byId = new Map(products.map((product) => [product.id, product]));
    const requested = new Map<string, number>(); for (const item of input.items) { const product = byId.get(item.productId)!; const packing = product.packings.find((row) => row.unitsPerPack > 1) ?? product.packings[0]; if (!packing) throw new HttpError(400, "INVALID_PACKING", `Packing is missing for ${product.name}.`); const base = item.quantity * (item.unit === "PACK" ? packing.unitsPerPack : 1); requested.set(product.id, (requested.get(product.id) ?? 0) + base); }
    const priced = [...requested].map(([productId, quantityBase]) => { const product = byId.get(productId)!; const unitPriceMinor = input.saleType === "RETAIL" ? product.retailPriceMinor : product.wholesalePriceMinor; return { product, quantityBase, unitPriceMinor, grossMinor: quantityBase * unitPriceMinor, taxRateBps: product.taxRateBps }; });
    const totals = calculateSaleTotals(priced, input.discountBps); const paymentRows = input.payments.map((payment) => ({ ...payment, amountMinor: moneyToMinor(payment.amount) })).filter((payment) => payment.amountMinor > 0); const paidMinor = paymentRows.reduce((sum, payment) => sum + payment.amountMinor, 0); if (paidMinor > totals.totalMinor) throw new HttpError(400, "OVERPAYMENT", "Payments exceed the sale total."); if (paidMinor < totals.totalMinor && !customer) throw new HttpError(400, "CUSTOMER_REQUIRED_FOR_CREDIT", "Select a customer for credit or partial-payment sales.");

    return this.db.$transaction(async (tx) => {
      await this.validateDiscount(tx, input, actor);
      const activeCustomer = customer ? await tx.customer.findFirst({ where: { id: customer.id, isActive: true, deletedAt: null } }) : null; const dueMinor = totals.totalMinor - paidMinor; if (customer && !activeCustomer) throw new HttpError(400, "INVALID_CUSTOMER", "Selected customer is unavailable."); let previousBalanceMinor = 0; if (activeCustomer) { const aggregate = await tx.customerLedger.aggregate({ where: { customerId: activeCustomer.id }, _sum: { debitMinor: true, creditMinor: true } }); previousBalanceMinor = (aggregate._sum.debitMinor ?? 0) - (aggregate._sum.creditMinor ?? 0); }
      const soldAt = new Date(); const dueDate = activeCustomer && dueMinor > 0 ? new Date(soldAt.getTime() + activeCustomer.paymentTermsDays * 86_400_000) : null;
      const invoiceBalances = calculateInvoiceBalances(previousBalanceMinor, dueMinor); const sale = await tx.sale.create({ data: { invoiceNumber: number("SAL"), customerId: activeCustomer?.id ?? null, paymentStatus: statusFor(paidMinor, totals.totalMinor), saleType: input.saleType, subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor, paidMinor, ...invoiceBalances, dueDate, soldAt, notes: input.notes ?? null, createdById: actor.id } });
      if (activeCustomer) await tx.customerLedger.create({ data: { customerId: activeCustomer.id, entryType: "SALE", debitMinor: totals.totalMinor, creditMinor: 0, sourceType: "SALE", sourceId: sale.id, saleId: sale.id, notes: `Sale ${sale.invoiceNumber}`, dueDate, occurredAt: sale.soldAt, createdById: actor.id } });
      for (const line of priced) await this.postProductLine(tx, sale.id, sale.invoiceNumber, line, input.discountBps, actor.id);
      const saleItems = await tx.saleItem.findMany({ where: { saleId: sale.id }, select: { quantityBase: true, costPriceMinor: true } });
      const costMinor = saleItems.reduce((sum, item) => sum + item.quantityBase * item.costPriceMinor, 0);
      const journalLines: PostingLine[] = [
        { systemCode: "AR", debitMinor: totals.totalMinor, customerId: activeCustomer?.id ?? null, memo: sale.invoiceNumber },
        { systemCode: "SALES", creditMinor: totals.subtotalMinor, memo: sale.invoiceNumber },
        ...(totals.discountMinor ? [{ systemCode: "SALES_DISCOUNTS" as const, debitMinor: totals.discountMinor, memo: sale.invoiceNumber }] : []),
        ...(totals.taxMinor ? [{ systemCode: "OUTPUT_TAX" as const, creditMinor: totals.taxMinor, memo: sale.invoiceNumber }] : []),
        ...(costMinor ? [{ systemCode: "COGS" as const, debitMinor: costMinor, memo: sale.invoiceNumber }, { systemCode: "INVENTORY" as const, creditMinor: costMinor, memo: sale.invoiceNumber }] : []),
      ];
      await AccountingPostingService.post(tx, { sourceType: "SALE", sourceId: sale.id, transactionDate: sale.soldAt, description: `Sale ${sale.invoiceNumber}`, createdById: actor.id, lines: journalLines });
      for (const payment of paymentRows) await this.payments.create(tx, { saleId: sale.id, customerId: activeCustomer?.id ?? null, method: payment.method, amountMinor: payment.amountMinor, reference: payment.reference ?? null, paidAt: sale.soldAt, userId: actor.id });
      await tx.auditLog.create({ data: { userId: actor.id, action: "POST", entityType: "Sale", entityId: sale.id, afterJson: JSON.stringify({ invoiceNumber: sale.invoiceNumber, totalMinor: totals.totalMinor, paidMinor, discountBps: input.discountBps }) } });
      const [postedSale, business] = await Promise.all([tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: invoiceInclude }), tx.setting.findUnique({ where: { key: "business" }, select: { valueJson: true } })]); return invoiceDto(postedSale, parseBusiness(business?.valueJson));
    });
  }

  async getInvoice(id: string) { const [sale, business] = await Promise.all([this.db.sale.findUnique({ where: { id }, include: invoiceInclude }), this.db.setting.findUnique({ where: { key: "business" }, select: { valueJson: true } })]); if (!sale) throw new HttpError(404, "SALE_NOT_FOUND", "Sale was not found."); return invoiceDto(sale, parseBusiness(business?.valueJson)); }
  async void(id: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id }, include: { items: true, payments: { include: { cashbookEntries: true } }, customerLedger: { include: { reversalEntry: true } }, returns: { where: { status: "POSTED" }, select: { id: true } } } });
      if (!sale) throw new HttpError(404, "SALE_NOT_FOUND", "Sale was not found.");
      if (sale.status !== "POSTED") throw new HttpError(409, "SALE_ALREADY_VOIDED", "Sale is not posted.");
      if (sale.returns.length) throw new HttpError(409, "SALE_HAS_RETURNS", "A sale with posted returns cannot be voided. Reverse the returns first.");
      const reversedAt = new Date();
      if (sale.payments.some((payment) => payment.method === "CASH")) await AccountingPostingService.assertCashDayOpen(tx, reversedAt);
      for (const item of sale.items) await applyStockMovement(tx, { productId: item.productId, batchId: item.batchId, movementType: "SALES_RETURN", quantityBase: item.quantityBase, unitCostMinor: item.costPriceMinor, sourceType: "SALE", sourceId: `${sale.id}:VOID`, sourceLineId: item.id, notes: `Void sale: ${reason}`, createdById: userId });
      for (const entry of sale.customerLedger) if (!entry.reversalEntry) await tx.customerLedger.create({ data: { customerId: entry.customerId, entryType: "REVERSAL", debitMinor: entry.creditMinor, creditMinor: entry.debitMinor, sourceType: "LEDGER_REVERSAL", sourceId: entry.id, notes: `Sale void: ${reason}`, reversalOfEntryId: entry.id, occurredAt: reversedAt, createdById: userId } });
      for (const payment of sale.payments) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "VOIDED" } });
        await tx.payment.create({ data: { receiptNumber: number("REV"), direction: "OUT", partyType: payment.partyType, customerId: payment.customerId, saleId: sale.id, method: payment.method, bankAccountId: payment.bankAccountId, amountMinor: payment.amountMinor, reference: payment.receiptNumber, notes: reason, paidAt: reversedAt, createdById: userId, reversalOfId: payment.id } });
        for (const cash of payment.cashbookEntries) await tx.cashbookEntry.create({ data: { entryNumber: number("CASH"), direction: cash.direction === "IN" ? "OUT" : "IN", entryType: "ADJUSTMENT", amountMinor: cash.amountMinor, sourceType: "CASHBOOK", sourceId: cash.id, notes: `Reversal of ${cash.entryNumber}: ${reason}`, occurredAt: reversedAt, createdById: userId, reversalOfId: cash.id } });
        const paymentJournal = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: "PAYMENT", sourceId: payment.id, postingKey: "PRIMARY" } } }); if (paymentJournal) await AccountingPostingService.reverse(tx, paymentJournal.id, reason, userId, reversedAt);
      }
      const saleJournal = await tx.journalEntry.findUnique({ where: { sourceType_sourceId_postingKey: { sourceType: "SALE", sourceId: sale.id, postingKey: "PRIMARY" } } }); if (saleJournal) await AccountingPostingService.reverse(tx, saleJournal.id, reason, userId, reversedAt);
      await tx.sale.update({ where: { id }, data: { status: "VOIDED" } });
      await tx.auditLog.create({ data: { userId, action: "VOID", entityType: "Sale", entityId: id, beforeJson: JSON.stringify({ status: "POSTED" }), afterJson: JSON.stringify({ status: "VOIDED", reason }) } });
      return { id, status: "VOIDED" as const };
    });
  }
  async hold(input: HoldSaleInput, userId: string) { return this.db.heldSale.create({ data: { label: input.label, cartJson: JSON.stringify(input.cart), createdById: userId } }); }
  async holds(userId: string) { const holds = await this.db.heldSale.findMany({ where: { createdById: userId }, orderBy: { updatedAt: "desc" } }); return holds.map((hold) => ({ id: hold.id, label: hold.label, cart: JSON.parse(hold.cartJson) as unknown, createdAt: hold.createdAt, updatedAt: hold.updatedAt })); }
  async removeHold(id: string, userId: string) { const result = await this.db.heldSale.deleteMany({ where: { id, createdById: userId } }); if (!result.count) throw new HttpError(404, "HELD_SALE_NOT_FOUND", "Held sale was not found."); }

  private async validateDiscount(tx: TransactionClient, input: CheckoutInput, actor: Actor) { if (input.discountBps <= actor.cashierDiscountLimitBps || actor.role !== "CASHIER") return; if (!input.approvalToken) throw new HttpError(403, "OWNER_APPROVAL_REQUIRED", "Owner PIN approval is required for this discount."); const approval = await tx.discountApproval.findFirst({ where: { tokenHash: hashToken(input.approvalToken), requestedById: actor.id, discountBps: input.discountBps, usedAt: null, expiresAt: { gt: new Date() } } }); if (!approval) throw new HttpError(403, "INVALID_DISCOUNT_APPROVAL", "Discount approval is invalid or expired."); await tx.discountApproval.update({ where: { id: approval.id }, data: { usedAt: new Date() } }); }

  private async postProductLine(tx: TransactionClient, saleId: string, invoiceNumber: string, line: { product: LoadedProduct; quantityBase: number; unitPriceMinor: number; grossMinor: number; taxRateBps: number }, discountBps: number, userId: string) {
    const allocations = allocateFefoStock(line.product.name, line.product.stockOnHandBaseQty, line.product.batches, line.quantityBase);
    const packing = line.product.packings.find((item) => item.unitsPerPack > 1) ?? line.product.packings[0]!;
    for (const allocation of allocations) { const gross = allocation.quantity * line.unitPriceMinor; const discountMinor = Math.round(gross * discountBps / 10_000); const taxMinor = Math.round((gross - discountMinor) * line.taxRateBps / 10_000); const costPriceMinor = line.product.averageCostMinor || allocation.batch?.purchasePriceMinor || line.product.purchasePriceMinor; const item = await tx.saleItem.create({ data: { saleId, productId: line.product.id, batchId: allocation.batch?.id ?? null, packingName: packing.name, unitsPerPack: packing.unitsPerPack, packQuantity: Math.floor(allocation.quantity / packing.unitsPerPack), baseQuantity: allocation.quantity % packing.unitsPerPack, quantityBase: allocation.quantity, unitPriceMinor: line.unitPriceMinor, costPriceMinor, discountMinor, taxMinor, lineTotalMinor: gross - discountMinor + taxMinor } }); await applyStockMovement(tx, { productId: line.product.id, batchId: allocation.batch?.id ?? null, movementType: "SALE", quantityBase: -allocation.quantity, unitCostMinor: costPriceMinor, sourceType: "SALE", sourceId: saleId, sourceLineId: item.id, notes: `Sale ${invoiceNumber}`, createdById: userId }); }
  }
}

function fefo(a: ProductBatch, b: ProductBatch) { if (!a.expiryDate && !b.expiryDate) return a.createdAt.valueOf() - b.createdAt.valueOf(); if (!a.expiryDate) return 1; if (!b.expiryDate) return -1; return a.expiryDate.valueOf() - b.expiryDate.valueOf(); }
type InvoiceRecord = Prisma.SaleGetPayload<{ include: typeof invoiceInclude }>;
type BusinessDetails = { name: string; nameUrdu: string; address: string; addressUrdu: string; phone: string; logoDataUrl: string | null; thankYou: string; thankYouUrdu: string };
function parseBusiness(value?: string): BusinessDetails { const defaults: BusinessDetails = { name: "Oil & Ghee Agency", nameUrdu: "آئل اینڈ گھی ایجنسی", address: "Main Market, Pakistan", addressUrdu: "مین مارکیٹ، پاکستان", phone: "", logoDataUrl: null, thankYou: "Thank you for your business", thankYouUrdu: "آپ کی خریداری کا شکریہ" }; if (!value) return defaults; try { const parsed = JSON.parse(value) as Partial<BusinessDetails>; return { ...defaults, ...Object.fromEntries(Object.entries(parsed).filter(([, item]) => typeof item === "string" || item === null)) }; } catch { return defaults; } }
function invoiceDto(sale: InvoiceRecord, business: BusinessDetails) { return { ...sale, business, subtotal: minorToMoney(sale.subtotalMinor), discount: minorToMoney(sale.discountMinor), tax: minorToMoney(sale.taxMinor), total: minorToMoney(sale.totalMinor), paid: minorToMoney(sale.paidMinor), due: minorToMoney(sale.totalMinor - sale.paidMinor), previousBalance: minorToMoney(sale.previousBalanceMinor), currentBalance: minorToMoney(sale.currentBalanceMinor), items: sale.items.map((item) => ({ ...item, unitPrice: minorToMoney(item.unitPriceMinor), discount: minorToMoney(item.discountMinor), tax: minorToMoney(item.taxMinor), lineTotal: minorToMoney(item.lineTotalMinor) })), payments: sale.payments.map((payment) => ({ ...payment, amount: minorToMoney(payment.amountMinor) })) }; }
