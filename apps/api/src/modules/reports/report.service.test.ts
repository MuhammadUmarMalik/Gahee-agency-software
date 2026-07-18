import { describe, expect, it } from "vitest";
import { inventoryReportFilterSchema, reportDateFilterSchema } from "@oil-agency/shared";
import { classifySaleSettlement } from "./report.service.js";

describe("report filters", () => {
  it("rejects a reversed date range", () => expect(reportDateFilterSchema.safeParse({ from: "2026-07-18", to: "2026-07-17" }).success).toBe(false));
  it("coerces and bounds near-expiry days", () => { expect(inventoryReportFilterSchema.parse({ nearExpiryDays: "45" }).nearExpiryDays).toBe(45); expect(inventoryReportFilterSchema.safeParse({ nearExpiryDays: "366" }).success).toBe(false); });
});
describe("cash and credit classification", () => {
  it("separates credit, partial, cash, and non-cash paid sales", () => { expect(classifySaleSettlement("UNPAID", 1000, 0)).toBe("CREDIT"); expect(classifySaleSettlement("PARTIAL", 1000, 500)).toBe("PARTIAL"); expect(classifySaleSettlement("PAID", 1000, 1000)).toBe("CASH"); expect(classifySaleSettlement("PAID", 1000, 0)).toBe("PAID_NON_CASH"); });
});
