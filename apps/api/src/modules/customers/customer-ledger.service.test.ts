import { describe, expect, it } from "vitest";
import { createCustomerInputSchema, manualLedgerInputSchema } from "@oil-agency/shared";
import { minorToMoney } from "../products/product.service.js";
import { aging, ledgerBalanceMinor } from "./customer-ledger.service.js";
import { signedMoneyToMinor } from "./customer.service.js";

describe("customer money and validation", () => {
  it("preserves signed credit opening balances", () => { expect(signedMoneyToMinor("-0.50")).toBe(-50); expect(minorToMoney(-50)).toBe("-0.50"); });
  it("validates customer account fields", () => expect(createCustomerInputSchema.safeParse({ name: "Ali Traders", businessName: "Ali Store", phone: "03001234567", whatsapp: "03001234567", address: "Lahore", taxIdentifier: "12345", customerType: "RETAILER", openingBalance: "100.00", paymentTermsDays: 14, isActive: true }).success).toBe(true));
  it("requires a reason for manual ledger entries", () => expect(manualLedgerInputSchema.safeParse({ direction: "DEBIT", amount: "10.00", reason: "", occurredAt: "2026-07-17" }).success).toBe(false));
});
describe("immutable ledger calculations", () => {
  const entries = [{ debitMinor: 10_000, creditMinor: 0, dueDate: new Date("2026-07-01"), occurredAt: new Date("2026-06-01") }, { debitMinor: 0, creditMinor: 4_000, dueDate: null, occurredAt: new Date("2026-06-15") }];
  it("calculates current balance from debit and credit entries", () => expect(ledgerBalanceMinor(entries)).toBe(6_000));
  it("applies receipts FIFO when calculating overdue recovery", () => expect(aging(entries, new Date("2026-07-17")).overdueMinor).toBe(6_000));
  it("a reversal cancels the original entry without modifying it", () => expect(ledgerBalanceMinor([...entries, { debitMinor: 0, creditMinor: 6_000 }])).toBe(0));
});
