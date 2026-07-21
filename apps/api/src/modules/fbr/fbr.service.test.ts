import { describe, expect, it, vi } from "vitest";
import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { DEFAULT_BUSINESS_SETTING } from "@oil-agency/shared";
import { buildFbrInvoicePayload, FbrService, isValidFbrResponse, parseFbrResponse } from "./fbr.service.js";

const sale = {
  soldAt: new Date("2026-07-19T07:00:00.000Z"),
  customer: { name: "Buyer", businessName: "Buyer Store", address: "Lahore", taxIdentifier: "1234567", province: "Punjab", fbrRegistrationType: "REGISTERED" },
  items: [{
    quantityBase: 2,
    unitPriceMinor: 10_000,
    discountMinor: 1_000,
    taxMinor: 3_420,
    taxRateBps: 1_800,
    lineTotalMinor: 22_420,
    fbrHsCode: null,
    fbrUom: null,
    fbrSaleType: null,
    fbrFixedNotifiedValueMinor: 0,
    fbrSroScheduleNo: null,
    fbrSroItemSerialNo: null,
    product: { name: "Cooking Oil", sku: "OIL-1", fbrHsCode: "1511.9090", fbrUom: "Numbers, pieces, units", fbrSaleType: "Goods at standard rate (default)", fbrFixedNotifiedValueMinor: 0, fbrSroScheduleNo: null, fbrSroItemSerialNo: null },
  }],
};

const business = { ...DEFAULT_BUSINESS_SETTING, name: "Agency", address: "Lahore", sellerNTNCNIC: "7654321", sellerProvince: "Punjab", fbrScenarioId: "SN001" };

describe("FBR invoice payload", () => {
  it("maps a posted sale to the FBR v1.12 sandbox shape using decimal-safe amounts", () => {
    const payload = buildFbrInvoicePayload(sale as never, business);
    expect(payload).toMatchObject({ invoiceType: "Sale Invoice", invoiceDate: "2026-07-19", sellerNTNCNIC: "7654321", buyerNTNCNIC: "1234567", buyerRegistrationType: "Registered", scenarioId: "SN001" });
    expect(payload.items[0]).toMatchObject({ hsCode: "1511.9090", rate: "18%", quantity: 2, valueSalesExcludingST: 190, salesTaxApplicable: 34.2, discount: 10, totalValues: 224.2, extraTax: "" });
  });

  it("refuses submission when a mandatory HS code is missing", () => {
    const invalid = { ...sale, items: [{ ...sale.items[0], product: { ...sale.items[0]!.product, fbrHsCode: null } }] };
    expect(() => buildFbrInvoicePayload(invalid as never, business)).toThrow(/HS code/);
  });

  it("uses the explicit unregistered buyer representation for walk-in sales", () => {
    const payload = buildFbrInvoicePayload({ ...sale, customer: null } as never, { ...business, fbrScenarioId: "SN002" });
    expect(payload).toMatchObject({ buyerNTNCNIC: "0000000000000", buyerBusinessName: "Walk-in Customer", buyerRegistrationType: "Unregistered" });
  });

  it("rejects SN001 for walk-in or unregistered sandbox buyers before calling FBR", () => {
    expect(() => buildFbrInvoicePayload({ ...sale, customer: null } as never, business)).toThrow(/SN001 is for registered buyers/i);
  });

  it("rejects SN002 for registered sandbox buyers before calling FBR", () => {
    expect(() => buildFbrInvoicePayload(sale as never, { ...business, fbrScenarioId: "SN002" })).toThrow(/SN002 is for unregistered buyers/i);
  });

  it("falls back to product FBR fields when an item snapshot is blank", () => {
    const item = { ...sale.items[0], fbrHsCode: " ", fbrUom: "", fbrSaleType: "  ", fbrFixedNotifiedValueMinor: 0, fbrSroScheduleNo: null, fbrSroItemSerialNo: null };
    expect(buildFbrInvoicePayload({ ...sale, items: [item] } as never, business).items[0]).toMatchObject({ hsCode: "1511.9090", uoM: "Numbers, pieces, units", saleType: "Goods at standard rate (default)" });
  });

  it("rejects corrupted line totals before calling FBR", () => {
    const invalid = { ...sale, items: [{ ...sale.items[0], lineTotalMinor: 1 }] };
    expect(() => buildFbrInvoicePayload(invalid as never, business)).toThrow(/line total/i);
  });

  it("rejects identifier lengths that are not accepted by FBR v1.12", () => {
    expect(() => buildFbrInvoicePayload(sale as never, { ...business, sellerNTNCNIC: "123456789" })).toThrow(/7 or 13 digits/);
    expect(() => buildFbrInvoicePayload({ ...sale, customer: { ...sale.customer, taxIdentifier: "123456789" } } as never, business)).toThrow(/7 or 13 digit/);
  });

  it("rejects the placeholder sandbox scenario before submission", () => {
    expect(() => buildFbrInvoicePayload(sale as never, { ...business, fbrScenarioId: "SN000" })).toThrow(/scenario ID assigned by FBR/i);
  });

  it("rejects standard-rate sale types with a zero product tax rate before FBR does", () => {
    const invalid = { ...sale, items: [{ ...sale.items[0], taxRateBps: 0, taxMinor: 0, lineTotalMinor: 19_000 }] };
    expect(() => buildFbrInvoicePayload(invalid as never, business)).toThrow(/standard rate/i);
  });
});

describe("FBR response parsing", () => {
  const valid = { invoiceNumber: "7000007DI1747119701593", validationResponse: { statusCode: "00", status: "Valid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "00", status: "Valid", invoiceNo: "7000007DI1747119701593-1", errorCode: "", error: "" }] } };

  it("accepts the official valid response shape", () => {
    const parsed = parseFbrResponse(JSON.stringify(valid));
    expect(parsed && isValidFbrResponse(parsed)).toBe(true);
  });

  it("rejects a top-level valid response containing an invalid item", () => {
    const parsed = parseFbrResponse(JSON.stringify({ ...valid, validationResponse: { ...valid.validationResponse, invoiceStatuses: [{ itemSNo: "1", statusCode: "01", status: "Invalid", errorCode: "0046", error: "Provide rate." }] } }))!;
    expect(isValidFbrResponse(parsed)).toBe(false);
  });

  it("rejects malformed or incomplete JSON instead of trusting it", () => {
    expect(parseFbrResponse("not-json")).toBeNull();
    expect(parseFbrResponse("{}")).toBeNull();
  });
});

describe("FBR submission workflow", () => {
  const submittedSale = {
    ...sale,
    id: "sale-1", status: "POSTED", fbrStatus: "PENDING", fbrInvoiceNumber: null, fbrSubmittedAt: null,
    items: sale.items.map((item) => ({ ...item, fbrHsCode: null, fbrUom: null, fbrSaleType: null, fbrFixedNotifiedValueMinor: 0, fbrSroScheduleNo: null, fbrSroItemSerialNo: null })),
  };

  function database() {
    const saleUpdate = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...submittedSale, ...data }));
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const db = {
      sale: { findUnique: vi.fn().mockResolvedValue(submittedSale), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: saleUpdate },
      setting: { findUnique: vi.fn().mockResolvedValue({ valueJson: JSON.stringify(business) }) },
      auditLog: { create: auditCreate },
      $transaction: vi.fn().mockImplementation(async (value: unknown) => typeof value === "function" ? (value as (tx: unknown) => unknown)({ sale: { update: saleUpdate }, auditLog: { create: auditCreate } }) : Promise.all(value as Promise<unknown>[])),
    };
    return { db: db as unknown as AppDbClient, saleUpdate };
  }

  it("does not mark an invoice failed when only the local token is missing", async () => {
    const { db, saleUpdate } = database();
    await expect(new FbrService(db, { token: "N/A" }).submit("sale-1", "user-1")).rejects.toMatchObject({ code: "FBR_TOKEN_NOT_CONFIGURED", status: 503 });
    expect(saleUpdate).not.toHaveBeenCalled();
  });

  it("persists an FBR rejection and throws it to the controller", async () => {
    const { db, saleUpdate } = database();
    const response = { validationResponse: { statusCode: "00", status: "Invalid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "01", status: "Invalid", errorCode: "0046", error: "Provide rate." }] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(new FbrService(db, { token: "sandbox-token", fetch }).submit("sale-1", "user-1")).rejects.toMatchObject({ code: "FBR_INVOICE_REJECTED", status: 422, message: expect.stringContaining("0046") });
    expect(saleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrStatus: "REQUIRES_REVIEW" }) }));
  });

  it("persists a valid posted invoice and its FBR number", async () => {
    const { db, saleUpdate } = database();
    const response = { invoiceNumber: "7000007DI1747119701593", validationResponse: { statusCode: "00", status: "Valid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "00", status: "Valid", invoiceNo: "7000007DI1747119701593-1", error: "" }] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await new FbrService(db, { token: "Bearer sandbox-token", fetch, now: () => new Date("2026-07-20T10:00:00Z") }).submit("sale-1", "user-1");
    expect(result).toMatchObject({ status: "submitted", invoiceNumber: "7000007DI1747119701593" });
    expect(saleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrStatus: "ACCEPTED", fbrInvoiceNumber: "7000007DI1747119701593" }) }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("postinvoicedata_sb"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sandbox-token", Accept: "*/*", "Accept-Language": "en-US", "x-request-id": expect.any(String) }) }));
  });

  it("omits the sandbox scenario from the production request body and payload hash", async () => {
    const { db } = database();
    const response = { invoiceNumber: "7000007DI1747119701593", validationResponse: { statusCode: "00", status: "Valid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "00", status: "Valid", invoiceNo: "7000007DI1747119701593-1", error: "" }] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }));
    await new FbrService(db, { token: "production-token", fetch, environment: "PRODUCTION" }).submit("sale-1", "user-1");
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("scenarioId");
    expect(db.sale.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrPayloadJson: expect.not.stringContaining("scenarioId"), fbrScenarioId: null }) }));
  });

  it("uses the validation endpoint without requiring an invoice number", async () => {
    const { db, saleUpdate } = database();
    const response = { validationResponse: { statusCode: "00", status: "Valid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "00", status: "Valid", error: "" }] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const result = await new FbrService(db, { token: "sandbox-token", fetch }).submit("sale-1", "user-1", true);
    expect(result.status).toBe("pending");
    expect(saleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrStatus: "PENDING", fbrInvoiceNumber: null }) }));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("validateinvoicedata_sb"), expect.anything());
  });

  it("treats a valid post response without its required invoice number as a gateway failure", async () => {
    const { db, saleUpdate } = database();
    const response = { validationResponse: { statusCode: "00", status: "Valid", error: "", invoiceStatuses: [{ itemSNo: "1", statusCode: "00", status: "Valid", error: "" }] } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    await expect(new FbrService(db, { token: "sandbox-token", fetch }).submit("sale-1", "user-1")).rejects.toMatchObject({ code: "FBR_INVOICE_NUMBER_MISSING", status: 502 });
    expect(saleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrStatus: "FAILED" }) }));
  });

  it("does not interpret an HTTP error as an invoice rejection", async () => {
    const { db, saleUpdate } = database();
    const fetch = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }));
    await expect(new FbrService(db, { token: "bad-token", fetch }).submit("sale-1", "user-1")).rejects.toMatchObject({ code: "FBR_AUTH_ERROR", status: 502 });
    expect(saleUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fbrStatus: "FAILED" }) }));
  });
});
