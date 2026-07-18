import { describe, expect, it } from "vitest";
import { createCashbookEntryInputSchema, dailyClosingInputSchema } from "@oil-agency/shared";
import { cashDifference, cashTotals, pakistanDay } from "./cashbook.service.js";

describe("cashbook totals", () => {
  it("calculates expected cash without double-counting opening cash", () => expect(cashTotals([{ direction: "IN", entryType: "OPENING_CASH", amountMinor: 10_000 }, { direction: "IN", entryType: "CASH_SALE", amountMinor: 5_000 }, { direction: "OUT", entryType: "EXPENSE", amountMinor: 1_500 }])).toEqual({ openingCashMinor: 10_000, cashInMinor: 5_000, cashOutMinor: 1_500, expectedCashMinor: 13_500 }));
  it("reports surplus and shortage as signed counted-minus-expected variance", () => { expect(cashDifference(10_000, 10_500)).toBe(500); expect(cashDifference(10_000, 9_500)).toBe(-500); });
  it("uses Pakistan business-day boundaries", () => { const day = pakistanDay("2026-07-17"); expect(day.start.toISOString()).toBe("2026-07-16T19:00:00.000Z"); expect(day.end.toISOString()).toBe("2026-07-17T18:59:59.999Z"); });
});
describe("cashbook validation", () => {
  it("blocks an invalid direction for owner withdrawal", () => expect(createCashbookEntryInputSchema.safeParse({ entryType: "OWNER_WITHDRAWAL", direction: "IN", amount: "100.00", occurredOn: "2026-07-17", notes: "Owner cash withdrawal" }).success).toBe(false));
  it("allows signed closing differences but not negative actual cash", () => { expect(dailyClosingInputSchema.safeParse({ businessDate: "2026-07-17", countedCash: "0.00" }).success).toBe(true); expect(dailyClosingInputSchema.safeParse({ businessDate: "2026-07-17", countedCash: "-1.00" }).success).toBe(false); });
});
