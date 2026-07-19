import { describe, expect, it } from "vitest";
import { calculateProfitAndLoss } from "./accounting.service.js";

describe("profit and loss calculation", () => {
  it("separates COGS, operating expenses, other income, gross profit, and net profit", () => {
    const result = calculateProfitAndLoss([
      { type: "REVENUE", systemCode: "SALES", netMinor: -1_000_000 },
      { type: "REVENUE", systemCode: "OTHER_INCOME", netMinor: -25_000 },
      { type: "CONTRA_REVENUE", systemCode: "SALES_RETURNS", netMinor: 50_000 },
      { type: "CONTRA_REVENUE", systemCode: "SALES_DISCOUNTS", netMinor: 10_000 },
      { type: "EXPENSE", systemCode: "COGS", netMinor: 700_000 },
      { type: "EXPENSE", systemCode: "EXPENSE_GENERAL", netMinor: 100_000 },
    ]);
    expect(result).toMatchObject({ revenueMinor: 1_000_000, contraRevenueMinor: 60_000, netRevenueMinor: 940_000, costOfGoodsSoldMinor: 700_000, grossProfitMinor: 240_000, otherIncomeMinor: 25_000, operatingExpensesMinor: 100_000, netProfitMinor: 165_000 });
    expect(result.grossMarginPercent).toBe(25.53);
    expect(result.netMarginPercent).toBe(17.55);
  });

  it("returns zero margins when revenue is zero", () => expect(calculateProfitAndLoss([])).toMatchObject({ grossMarginPercent: 0, netMarginPercent: 0, netProfitMinor: 0 }));
});
