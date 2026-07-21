import type { AppDbClient } from "../../lib/db.js";
import { HttpError } from "../../lib/http-error.js";
import { minorToMoney } from "../products/product.service.js";
import { AccountingPostingService } from "../accounting/posting.service.js";
import { pakistanDate, pakistanDay } from "../../lib/business-time.js";

type SupplierLedgerMoney = { debitMinor: number; creditMinor: number };
type SupplierLedgerAgingEntry = SupplierLedgerMoney & { dueDate: Date | null; occurredAt: Date };

export const supplierPayableMinor = (entries: SupplierLedgerMoney[]) => entries.reduce((sum, entry) => sum + entry.creditMinor - entry.debitMinor, 0);
export function supplierAging(entries: SupplierLedgerAgingEntry[], asOf = new Date()) { const debts: Array<{ remaining: number; dueDate: Date | null }> = []; let advance = 0; for (const entry of [...entries].sort((a, b) => a.occurredAt.valueOf() - b.occurredAt.valueOf())) { let credit = entry.creditMinor; if (credit && advance) { const used = Math.min(credit, advance); credit -= used; advance -= used; } if (credit) debts.push({ remaining: credit, dueDate: entry.dueDate }); let debit = entry.debitMinor; for (const debt of debts) { if (!debit) break; const used = Math.min(debit, debt.remaining); debt.remaining -= used; debit -= used; } advance += debit; } const start = pakistanDay(pakistanDate(asOf)).start; const open = debts.filter((debt): debt is { remaining: number; dueDate: Date } => debt.remaining > 0 && debt.dueDate !== null); return { overdueMinor: open.filter((debt) => debt.dueDate < start).reduce((sum, debt) => sum + debt.remaining, 0), earliestDueDate: open.sort((a, b) => a.dueDate.valueOf() - b.dueDate.valueOf())[0]?.dueDate ?? null }; }

export class SupplierLedgerService {
  constructor(private readonly db: AppDbClient) {}
  async statement(supplierId: string, from?: string, to?: string) {
    const supplier = await this.db.supplier.findFirst({ where: { id: supplierId, deletedAt: null } }); if (!supplier) throw new HttpError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found.");
    const all = await this.db.supplierLedger.findMany({ where: { supplierId, ...(to ? { occurredAt: { lte: pakistanDay(to).end } } : {}) }, include: { purchase: { select: { invoiceNumber: true, supplierInvoice: true } }, payment: { select: { receiptNumber: true, method: true } }, createdBy: { select: { displayName: true } }, reversalEntry: { select: { id: true } } }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] });
    const fromDate = from ? pakistanDay(from).start : null; let running = 0; const entries: Array<Record<string, unknown>> = [];
    for (const entry of all) { const previousBalanceMinor = running; running += entry.creditMinor - entry.debitMinor; if (!fromDate || entry.occurredAt >= fromDate) entries.push({ ...entry, debit: minorToMoney(entry.debitMinor), credit: minorToMoney(entry.creditMinor), previousBalance: minorToMoney(previousBalanceMinor), currentBalance: minorToMoney(running) }); }
    const previous = fromDate ? supplierPayableMinor(all.filter((entry) => entry.occurredAt < fromDate)) : 0, age = supplierAging(all);
    return { supplier: { ...supplier, openingBalance: minorToMoney(supplier.openingBalanceMinor) }, entries, previousBalance: minorToMoney(previous), currentBalance: minorToMoney(running), overdue: minorToMoney(age.overdueMinor), earliestDueDate: age.earliestDueDate?.toISOString() ?? null, lastPurchaseAt: (await this.db.purchase.findFirst({ where: { supplierId, status: "POSTED" }, orderBy: { purchasedAt: "desc" }, select: { purchasedAt: true } }))?.purchasedAt.toISOString() ?? null };
  }
  async reverse(entryId: string, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const original = await tx.supplierLedger.findUnique({ where: { id: entryId }, include: { reversalEntry: true } });
      if (!original) throw new HttpError(404, "LEDGER_ENTRY_NOT_FOUND", "Supplier ledger entry was not found.");
      if (original.entryType === "REVERSAL" || original.reversalEntry) throw new HttpError(409, "ENTRY_ALREADY_REVERSED", "This entry is already a reversal or has already been reversed.");
      if (original.entryType !== "OPENING_BALANCE") throw new HttpError(409, "SOURCE_REVERSAL_REQUIRED", "Reverse this entry from its original purchase, payment, or return.");
      const reversal = await tx.supplierLedger.create({ data: { supplierId: original.supplierId, entryType: "REVERSAL", debitMinor: original.creditMinor, creditMinor: original.debitMinor, sourceType: "SUPPLIER_LEDGER_REVERSAL", sourceId: original.id, notes: `Reversal: ${reason}`, occurredAt: new Date(), reversalOfEntryId: original.id, createdById: userId } });
      const journal = await tx.journalEntry.findFirst({ where: { sourceId: original.sourceId, sourceType: original.sourceType, postingKey: "PRIMARY" } });
      if (journal) await AccountingPostingService.reverse(tx, journal.id, reason, userId);
      await tx.auditLog.create({ data: { userId, action: "REVERSE", entityType: "SupplierLedgerReversal", entityId: reversal.id, beforeJson: JSON.stringify({ originalEntryId: original.id }), afterJson: JSON.stringify({ reason }) } });
      return reversal;
    });
  }
}
