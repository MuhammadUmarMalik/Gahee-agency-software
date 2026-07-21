import { describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "../../lib/db.js";
import { AccountingPostingService } from "./posting.service.js";

function transaction(existing: unknown = null) {
  const accounts = new Map<string, string>();
  return {
    account: {
      upsert: vi.fn().mockImplementation(({ create }) => { accounts.set(create.systemCode, create.code); return Promise.resolve(create); }),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve({ id: accounts.get(where.systemCode) ?? where.systemCode, isActive: true })),
    },
    financialPeriod: { upsert: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: "period-1", name: "2026", status: "OPEN" }), findUnique: vi.fn().mockResolvedValue({ id: "period-1", name: "2026", status: "OPEN" }) },
    journalEntry: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "journal-1", ...data, lines: data.lines.create })) },
  } as unknown as TransactionClient;
}

describe("double-entry posting", () => {
  it("posts a balanced journal with source idempotency", async () => { const tx = transaction(); const journal = await AccountingPostingService.post(tx, { sourceType: "PAYMENT", sourceId: "payment-1", transactionDate: new Date("2026-07-17T12:00:00Z"), description: "Customer receipt", createdById: "user-1", lines: [{ systemCode: "CASH", debitMinor: 10_000 }, { systemCode: "AR", creditMinor: 10_000, customerId: "customer-1" }] }); expect(journal.totalDebitMinor).toBe(10_000); expect(journal.totalCreditMinor).toBe(10_000); expect(tx.journalEntry.create).toHaveBeenCalledOnce(); });
  it("falls back to the auto-managed year period when range lookup misses", async () => { const tx = transaction() as any; tx.financialPeriod.findFirst.mockResolvedValue(null); await AccountingPostingService.post(tx, { sourceType: "PURCHASE", sourceId: "purchase-1", transactionDate: new Date("2026-07-20T12:00:00Z"), description: "Purchase", createdById: "user-1", lines: [{ systemCode: "INVENTORY", debitMinor: 100 }, { systemCode: "AP", creditMinor: 100 }] }); expect(tx.financialPeriod.findUnique).toHaveBeenCalledWith({ where: { name: "2026" } }); expect(tx.journalEntry.create).toHaveBeenCalledOnce(); });
  it("rejects an unbalanced journal before writing", async () => { const tx = transaction(); await expect(AccountingPostingService.post(tx, { sourceType: "SALE", sourceId: "sale-1", transactionDate: new Date("2026-07-17T12:00:00Z"), description: "Bad sale", createdById: "user-1", lines: [{ systemCode: "AR", debitMinor: 100 }, { systemCode: "SALES", creditMinor: 90 }] })).rejects.toMatchObject({ code: "UNBALANCED_JOURNAL" }); expect(tx.journalEntry.create).not.toHaveBeenCalled(); });
  it("returns an existing source posting instead of duplicating it", async () => { const existing = { id: "existing", lines: [], totalDebitMinor: 100, totalCreditMinor: 100 }; const tx = transaction(existing); expect(await AccountingPostingService.post(tx, { sourceType: "SALE", sourceId: "sale-1", transactionDate: new Date(), description: "Sale", createdById: "user-1", lines: [{ systemCode: "AR", debitMinor: 100 }, { systemCode: "SALES", creditMinor: 100 }] })).toBe(existing); expect(tx.journalEntry.create).not.toHaveBeenCalled(); });
  it("blocks posting into a closed financial period", async () => { const tx = transaction() as any; tx.financialPeriod.findFirst.mockResolvedValue({ id: "period-1", name: "2026", status: "CLOSED" }); await expect(AccountingPostingService.post(tx, { sourceType: "EXPENSE", sourceId: "expense-1", transactionDate: new Date(), description: "Rent", createdById: "user-1", lines: [{ systemCode: "EXPENSE_GENERAL", debitMinor: 100 }, { systemCode: "CASH", creditMinor: 100 }] })).rejects.toMatchObject({ code: "FINANCIAL_PERIOD_CLOSED" }); });
});
