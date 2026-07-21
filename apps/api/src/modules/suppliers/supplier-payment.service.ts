import type { AppDbClient } from "../../lib/db.js";
import type { SupplierPaymentInput } from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";
import { moneyToMinor, minorToMoney } from "../products/product.service.js";
import { AccountingPostingService } from "../accounting/posting.service.js";

const ref = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const atNoon = (value: string) => new Date(`${value}T12:00:00.000Z`);

export class SupplierPaymentService {
  constructor(private readonly db: AppDbClient) {}
  async pay(supplierId: string, input: SupplierPaymentInput, userId: string) {
    const amountMinor = moneyToMinor(input.amount);
    if (amountMinor <= 0) throw new HttpError(400, "INVALID_PAYMENT", "Payment must be greater than zero.");
    return this.db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, isActive: true, deletedAt: null } });
      if (!supplier) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "Active supplier was not found.");
      const paidAt = atNoon(input.paidAt);
      if (input.method === "CASH") await AccountingPostingService.assertCashDayOpen(tx, paidAt);
      const payment = await tx.payment.create({ data: { receiptNumber: ref("SP"), direction: "OUT", partyType: "SUPPLIER", supplierId, method: input.method, amountMinor, reference: input.reference ?? null, notes: input.notes ?? null, paidAt, createdById: userId } });
      const ledger = await tx.supplierLedger.create({ data: { supplierId, entryType: "PAYMENT", debitMinor: amountMinor, creditMinor: 0, sourceType: "PAYMENT", sourceId: payment.id, paymentId: payment.id, notes: input.notes ?? `Payment ${payment.receiptNumber}`, occurredAt: paidAt, createdById: userId } });
      if (input.method === "CASH") await tx.cashbookEntry.create({ data: { entryNumber: ref("CASH"), direction: "OUT", entryType: "SUPPLIER_PAYMENT", amountMinor, paymentId: payment.id, sourceType: "PAYMENT", sourceId: payment.id, reference: payment.receiptNumber, notes: `Supplier payment ${payment.receiptNumber}`, occurredAt: paidAt, createdById: userId } });
      const tenderAccountId = await AccountingPostingService.tenderAccountId(tx, input.method, payment.bankAccountId);
      await AccountingPostingService.post(tx, { sourceType: "PAYMENT", sourceId: payment.id, transactionDate: paidAt, description: `Supplier payment ${payment.receiptNumber}`, createdById: userId, lines: [{ systemCode: "AP", debitMinor: amountMinor, supplierId }, { accountId: tenderAccountId, creditMinor: amountMinor, supplierId }] });
      await tx.auditLog.create({ data: { userId, action: "POST", entityType: "SupplierPayment", entityId: payment.id, afterJson: JSON.stringify({ supplierId, amountMinor, ledgerEntryId: ledger.id }) } });
      return { ...payment, amount: minorToMoney(amountMinor), supplier: { id: supplier.id, name: supplier.name, businessName: supplier.businessName } };
    });
  }
}
