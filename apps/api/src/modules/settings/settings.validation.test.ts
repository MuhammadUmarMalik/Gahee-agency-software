import { describe, expect, it } from "vitest";
import { businessSettingSchema, DEFAULT_BUSINESS_SETTING, printingSettingSchema, shortcutSettingSchema } from "@oil-agency/shared";

describe("settings validation", () => {
  it("accepts complete agency invoice details", () => { expect(businessSettingSchema.parse(DEFAULT_BUSINESS_SETTING).currency).toBe("PKR"); });
  it("rejects executable content as an agency logo", () => { expect(businessSettingSchema.safeParse({ ...DEFAULT_BUSINESS_SETTING, logoDataUrl: "data:text/html;base64,PHNjcmlwdD4=" }).success).toBe(false); });
  it("requires unique POS shortcut keys", () => { expect(shortcutSettingSchema.safeParse({ focusSearch: "F2", checkout: "F2", holdSale: "F6", resumeSale: "F8" }).success).toBe(false); });
  it("supports A4 as the automatic invoice default", () => { expect(printingSettingSchema.parse({ defaultPaper: "A4", autoPrint: true })).toEqual({ defaultPaper: "A4", autoPrint: true }); });
});
