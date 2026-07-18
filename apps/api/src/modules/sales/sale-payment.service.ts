import type { PaymentMethod } from "@prisma/client";
import type { TransactionClient } from "../inventory/stock-engine.js";
import { AccountingPostingService } from "../accounting/posting.service.js";

const number = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
export class SalePaymentService {
  async create(tx: TransactionClient, data: { saleId: string; customerId: string | null; method: PaymentMethod; amountMinor: number; reference: string | null; paidAt: Date; userId: string }) {
    if (data.method === "CASH") await AccountingPostingService.assertCashDayOpen(tx, data.paidAt);
    const payment = await tx.payment.create({ data: { receiptNumber: number("RCP"), direction: "IN", partyType: data.customerId ? "CUSTOMER" : "OTHER", customerId: data.customerId, saleId: data.saleId, method: data.method, amountMinor: data.amountMinor, reference: data.reference, paidAt: data.paidAt, createdById: data.userId } });
    if (data.customerId) await tx.customerLedger.create({ data: { customerId: data.customerId, entryType: "PAYMENT", debitMinor: 0, creditMinor: data.amountMinor, sourceType: "PAYMENT", sourceId: payment.id, saleId: data.saleId, paymentId: payment.id, notes: `Receipt ${payment.receiptNumber}`, occurredAt: data.paidAt, createdById: data.userId } });
    if (data.method === "CASH") await tx.cashbookEntry.create({ data: { entryNumber: number("CASH"), direction: "IN", entryType: "CASH_SALE", amountMinor: data.amountMinor, paymentId: payment.id, sourceType: "PAYMENT", sourceId: payment.id, reference: payment.receiptNumber, notes: `Sale receipt ${payment.receiptNumber}`, occurredAt: data.paidAt, createdById: data.userId } });
    const tenderAccountId = await AccountingPostingService.tenderAccountId(tx, data.method, payment.bankAccountId);
    await AccountingPostingService.post(tx, { sourceType: "PAYMENT", sourceId: payment.id, transactionDate: data.paidAt, description: `Sale receipt ${payment.receiptNumber}`, createdById: data.userId, lines: [{ accountId: tenderAccountId, debitMinor: data.amountMinor, customerId: data.customerId }, { systemCode: "AR", creditMinor: data.amountMinor, customerId: data.customerId }] });
    return payment;
  }
}
