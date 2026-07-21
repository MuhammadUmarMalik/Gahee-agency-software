import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  businessSettingSchema,
  DEFAULT_BUSINESS_SETTING,
  type BusinessSetting,
} from "@oil-agency/shared";
import { HttpError } from "../../lib/http-error.js";

export const FBR_SANDBOX_POST_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb";
export const FBR_SANDBOX_VALIDATE_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb";
export const FBR_PRODUCTION_POST_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata";
export const FBR_PRODUCTION_VALIDATE_URL =
  "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata";

const MAX_FBR_RESPONSE_BYTES = 1_000_000;
const FBR_DB_STATUS = {
  pending: "PENDING",
  submitting: "SUBMITTING",
  submitted: "ACCEPTED",
  failed: "FAILED",
  requires_review: "REQUIRES_REVIEW",
} as const;

const fbrSaleInclude = {
  customer: {
    select: {
      name: true,
      businessName: true,
      address: true,
      taxIdentifier: true,
      province: true,
      fbrRegistrationType: true,
    },
  },
  items: {
    include: {
      product: {
        select: {
          name: true,
          sku: true,
          fbrHsCode: true,
          fbrUom: true,
          fbrSaleType: true,
          fbrFixedNotifiedValueMinor: true,
          fbrSroScheduleNo: true,
          fbrSroItemSerialNo: true,
        },
      },
    },
  },
} satisfies Record<string, unknown>;

type FbrSaleItem = {
  unitPriceMinor: number;
  quantityBase: number;
  discountMinor: number;
  taxMinor: number;
  taxRateBps: number;
  lineTotalMinor: number;
  fbrHsCode: string | null;
  fbrUom: string | null;
  fbrSaleType: string | null;
  fbrFixedNotifiedValueMinor: number | null;
  fbrSroScheduleNo: string | null;
  fbrSroItemSerialNo: string | null;
  product: {
    name: string;
    sku: string;
    fbrHsCode: string | null;
    fbrUom: string | null;
    fbrSaleType: string | null;
    fbrFixedNotifiedValueMinor: number;
    fbrSroScheduleNo: string | null;
    fbrSroItemSerialNo: string | null;
  };
};

type FbrSale = {
  id: string;
  status: string;
  fbrStatus: string;
  fbrInvoiceNumber: string | null;
  fbrError: string | null;
  fbrSubmittedAt: Date | null;
  soldAt: Date;
  customer: {
    name: string;
    businessName: string | null;
    address: string | null;
    taxIdentifier: string | null;
    province: string | null;
    fbrRegistrationType: string;
  } | null;
  items: FbrSaleItem[];
};

// Keep this boundary explicit so an editor holding a stale generated client
// snapshot can still type-check while the Drizzle schema is the source of truth.
// The field is persisted by Sale.fbrPayloadHash in apps/api/src/db/schema.ts.
type FbrSaleWithPayloadHash = FbrSale & { fbrPayloadHash: string | null };
type FbrLockUpdate = {
  fbrPayloadHash: string;
};

export interface FbrInvoiceItem {
  hsCode: string;
  productDescription: string;
  rate: string;
  uoM: string;
  quantity: number;
  totalValues: number;
  valueSalesExcludingST: number;
  fixedNotifiedValueOrRetailPrice: number;
  salesTaxApplicable: number;
  salesTaxWithheldAtSource: number;
  extraTax: number | "";
  furtherTax: number;
  sroScheduleNo: string;
  fedPayable: number;
  discount: number;
  saleType: string;
  sroItemSerialNo: string;
}

export interface FbrInvoicePayload {
  invoiceType: "Sale Invoice";
  invoiceDate: string;
  sellerNTNCNIC: string;
  sellerBusinessName: string;
  sellerProvince: string;
  sellerAddress: string;
  buyerNTNCNIC: string;
  buyerBusinessName: string;
  buyerProvince: string;
  buyerAddress: string;
  buyerRegistrationType: "Registered" | "Unregistered";
  invoiceRefNo: string;
  scenarioId?: string;
  items: FbrInvoiceItem[];
}

const fbrInvoiceStatusSchema = z
  .object({
    itemSNo: z.coerce.string().optional(),
    statusCode: z.coerce.string().optional(),
    status: z.string().optional(),
    invoiceNo: z.string().nullable().optional(),
    errorCode: z.coerce.string().nullable().optional(),
    error: z.string().optional(),
  })
  .passthrough();

const fbrApiResponseSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).optional(),
    dated: z.string().optional(),
    validationResponse: z
      .object({
        statusCode: z.coerce.string().optional(),
        status: z.string().optional(),
        errorCode: z.coerce.string().nullable().optional(),
        error: z.string().optional(),
        invoiceStatuses: z.array(fbrInvoiceStatusSchema).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type FbrApiResponse = z.infer<typeof fbrApiResponseSchema>;

export type FbrServiceOptions = {
  fetch?: typeof globalThis.fetch;
  token?: string;
  environment?: "SANDBOX" | "PRODUCTION";
  now?: () => Date;
  timeoutMs?: number;
};

export type FbrConnectionTestResult = {
  environment: "SANDBOX" | "PRODUCTION";
  reachable: boolean;
  authenticated: boolean;
  httpStatus: number;
  message: string;
};

const money = (minor: number) => Number((minor / 100).toFixed(2));
const rate = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

export function buildFbrInvoicePayload(
  sale: FbrSale,
  business: BusinessSetting,
): FbrInvoicePayload {
  const missing: string[] = [];
  if (!nonBlank(business.sellerNTNCNIC)) missing.push("seller NTN/CNIC");
  if (!nonBlank(business.sellerProvince)) missing.push("seller province");
  if (!nonBlank(business.name)) missing.push("seller business name");
  if (!nonBlank(business.address)) missing.push("seller address");
  if (business.fbrEnvironment === "SANDBOX" && business.fbrScenarioId === "SN000")
    missing.push("sandbox scenario ID assigned by FBR");
  if (!sale.items.length) missing.push("at least one invoice item");
  for (const item of sale.items) {
    if (!firstNonBlank(item.fbrHsCode, item.product.fbrHsCode))
      missing.push(`${item.product.name}: HS code`);
    if (!firstNonBlank(item.fbrUom, item.product.fbrUom))
      missing.push(`${item.product.name}: FBR unit of measure`);
    if (!firstNonBlank(item.fbrSaleType, item.product.fbrSaleType))
      missing.push(`${item.product.name}: FBR sale type`);
    validateFbrLine(item);
  }
  if (missing.length)
    throw new HttpError(
      422,
      "FBR_DATA_INCOMPLETE",
      `Complete these FBR fields before submission: ${[...new Set(missing)].join(", ")}.`,
    );

  const buyerRegistered = sale.customer?.fbrRegistrationType === "REGISTERED";
  const sellerIdentifier = digits(business.sellerNTNCNIC);
  if (!/^(?:\d{7}|\d{13})$/.test(sellerIdentifier))
    throw new HttpError(
      422,
      "FBR_SELLER_NTN_INVALID",
      "Seller NTN/CNIC must contain exactly 7 or 13 digits for FBR.",
    );
  const buyerIdentifier = digits(sale.customer?.taxIdentifier ?? "");
  if (buyerRegistered && !/^(?:\d{7}|\d{13})$/.test(buyerIdentifier))
    throw new HttpError(
      422,
      "FBR_BUYER_NTN_REQUIRED",
      "A registered FBR buyer must have a 7 or 13 digit NTN/CNIC.",
    );
  const scenarioId = business.fbrScenarioId.trim();
  validateSandboxScenarioForBuyer({
    environment: business.fbrEnvironment,
    scenarioId,
    buyerRegistered,
  });
  return {
    invoiceType: "Sale Invoice",
    invoiceDate: pakistanDate(sale.soldAt),
    sellerNTNCNIC: sellerIdentifier,
    sellerBusinessName: business.name.trim(),
    sellerProvince: business.sellerProvince.trim(),
    sellerAddress: business.address.trim(),
    buyerNTNCNIC: buyerRegistered ? buyerIdentifier : "0000000000000",
    buyerBusinessName:
      nonBlank(sale.customer?.businessName) ||
      nonBlank(sale.customer?.name) ||
      "Walk-in Customer",
    buyerProvince:
      nonBlank(sale.customer?.province) || business.sellerProvince.trim(),
    buyerAddress: nonBlank(sale.customer?.address) || business.address.trim(),
    buyerRegistrationType: buyerRegistered ? "Registered" : "Unregistered",
    invoiceRefNo: "",
    scenarioId,
    items: sale.items.map((item) => {
      const excludingTaxMinor =
        item.unitPriceMinor * item.quantityBase - item.discountMinor;
      const hsCode = firstNonBlank(item.fbrHsCode, item.product.fbrHsCode)!;
      const uoM = firstNonBlank(item.fbrUom, item.product.fbrUom)!;
      const saleType = firstNonBlank(
        item.fbrSaleType,
        item.product.fbrSaleType,
      )!;
      validateFbrSaleTypeRate(item, saleType);
      return {
        hsCode,
        productDescription: `${item.product.name.trim()} (${item.product.sku.trim()})`,
        rate: rate(item.taxRateBps),
        uoM,
        quantity: item.quantityBase,
        totalValues: money(item.lineTotalMinor),
        valueSalesExcludingST: money(excludingTaxMinor),
        fixedNotifiedValueOrRetailPrice: money(
          (item.fbrFixedNotifiedValueMinor ??
            item.product.fbrFixedNotifiedValueMinor) * item.quantityBase,
        ),
        salesTaxApplicable: money(item.taxMinor),
        salesTaxWithheldAtSource: 0,
        extraTax: "",
        furtherTax: 0,
        sroScheduleNo:
          firstNonBlank(item.fbrSroScheduleNo, item.product.fbrSroScheduleNo) ??
          "",
        fedPayable: 0,
        discount: money(item.discountMinor),
        saleType,
        sroItemSerialNo:
          firstNonBlank(
            item.fbrSroItemSerialNo,
            item.product.fbrSroItemSerialNo,
          ) ?? "",
      };
    }),
  };
}

function validateSandboxScenarioForBuyer(input: {
  environment: BusinessSetting["fbrEnvironment"];
  scenarioId: string;
  buyerRegistered: boolean;
}) {
  if (input.environment !== "SANDBOX") return;
  if (input.scenarioId === "SN001" && !input.buyerRegistered)
    throw new HttpError(
      422,
      "FBR_SCENARIO_BUYER_MISMATCH",
      "Sandbox scenario SN001 is for registered buyers. Use SN002 for a walk-in or unregistered buyer, or select a registered customer with a valid NTN/CNIC.",
    );
  if (input.scenarioId === "SN002" && input.buyerRegistered)
    throw new HttpError(
      422,
      "FBR_SCENARIO_BUYER_MISMATCH",
      "Sandbox scenario SN002 is for unregistered buyers. Use SN001 for a registered buyer, or mark the customer as unregistered.",
    );
}

export class FbrService {
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly configuredToken: string | undefined;
  private readonly configuredEnvironment: "SANDBOX" | "PRODUCTION" | undefined;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(
    private readonly db: AppDbClient,
    options: FbrServiceOptions = {},
  ) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.configuredToken = normalizeToken(options.token);
    this.configuredEnvironment = options.environment;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async status() {
    const business = await this.business();
    const environment = this.configuredEnvironment ?? business.fbrEnvironment;
    return {
      environment,
      tokenConfigured: Boolean(this.configuredToken),
      postUrl: endpoints(environment).post,
      validateUrl: endpoints(environment).validate,
    };
  }

  async testConnection(): Promise<FbrConnectionTestResult> {
    const business = await this.business();
    const environment = this.configuredEnvironment ?? business.fbrEnvironment;
    if (!this.configuredToken)
      throw new HttpError(
        503,
        "FBR_TOKEN_NOT_CONFIGURED",
        "FBR security token is not configured for the selected environment.",
      );

    let response: Response;
    let responseText: string;
    try {
      response = await this.fetchFn(endpoints(environment).validate, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.configuredToken}`,
          "Content-Type": "application/json",
          Accept: "*/*",
          "Accept-Language": "en-US",
          "x-request-id": fbrRequestId("connection-test", createHash("sha256").update(String(this.now().getTime())).digest("hex")),
          "User-Agent": "oil-agency-pos/0.1.0",
        },
        body: "{}",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      responseText = await readLimitedResponse(response);
    } catch (requestError) {
      const message = safeErrorMessage(requestError, "FBR connection failed.");
      throw new HttpError(
        502,
        "FBR_CONNECTION_FAILED",
        `Could not reach FBR ${environment.toLowerCase()} gateway: ${message}`,
      );
    }

    const parsed = parseFbrResponse(responseText);
    const message = response.ok
      ? "FBR gateway is reachable and accepted the security token. Validation errors are expected because no invoice was sent."
      : fbrError(response, parsed, responseText);
    const authenticated = response.status !== 401 && response.status !== 403;
    if (!authenticated)
      throw new HttpError(502, "FBR_AUTH_ERROR", message);
    if (response.status >= 500)
      throw new HttpError(503, "FBR_HTTP_ERROR", message);

    return {
      environment,
      reachable: true,
      authenticated,
      httpStatus: response.status,
      message,
    };
  }

  async submit(saleId: string, userId: string, validateOnly = false) {
    const sale = (await this.db.sale.findUnique({
      where: { id: saleId },
      include: fbrSaleInclude,
    })) as FbrSaleWithPayloadHash | null;
    if (!sale)
      throw new HttpError(404, "SALE_NOT_FOUND", "Sale was not found.");
    if (sale.fbrStatus === FBR_DB_STATUS.submitted) {
      if (sale.fbrInvoiceNumber) return this.result(sale);
      throw new HttpError(
        409,
        "FBR_ACCEPTED_NUMBER_MISSING",
        "This sale is marked accepted but has no FBR invoice number. Reconcile it with the FBR portal before retrying.",
      );
    }
    if (sale.status !== "POSTED")
      throw new HttpError(
        409,
        "FBR_SALE_NOT_POSTED",
        "Only posted sales can be submitted to FBR.",
      );
    if (sale.fbrStatus === FBR_DB_STATUS.submitting)
      throw new HttpError(
        409,
        "FBR_SUBMISSION_IN_PROGRESS",
        "This invoice has an unfinished FBR submission. Verify it in the FBR portal before retrying to avoid a duplicate invoice.",
      );

    const business = await this.business();
    let payload: FbrInvoicePayload;
    try {
      payload = buildFbrInvoicePayload(sale, business);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "FBR invoice data is incomplete.";
      await this.fail(saleId, FBR_DB_STATUS.requires_review, message, userId);
      throw error;
    }
    if (!this.configuredToken) {
      const message =
        "FBR security token is not configured for the selected environment.";
      throw new HttpError(503, "FBR_TOKEN_NOT_CONFIGURED", message);
    }

    const environment = this.configuredEnvironment ?? business.fbrEnvironment;
    const processingStatus = FBR_DB_STATUS.submitting;
    const payloadForEnvironment =
      environment === "SANDBOX"
        ? payload
        : withoutSandboxScenario(payload);
    const payloadJson = JSON.stringify(payloadForEnvironment);
    const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
    if (sale.fbrPayloadHash && sale.fbrPayloadHash !== payloadHash)
      throw new HttpError(
        409,
        "FBR_PAYLOAD_CHANGED",
        "The invoice payload changed after its first FBR attempt. Review it instead of resubmitting automatically.",
      );
    const locked = await this.db.sale.updateMany({
      where: { id: saleId, fbrStatus: { not: FBR_DB_STATUS.submitting } },
      data: {
        fbrStatus: processingStatus,
        fbrScenarioId: payloadForEnvironment.scenarioId ?? null,
        fbrPayloadJson: payloadJson,
        fbrPayloadHash: payloadHash,
        fbrError: null,
      } as FbrLockUpdate,
    });
    if (!locked.count)
      throw new HttpError(
        409,
        "FBR_SUBMISSION_IN_PROGRESS",
        "This invoice is already being processed by FBR.",
      );
    await this.persistExtraSaleFields(saleId, {
      fbrRequestJson: JSON.stringify(payloadForEnvironment),
    });

    let response: Response;
    let responseText: string;
    try {
      response = await this.fetchFn(
        validateOnly ? endpoints(environment).validate : endpoints(environment).post,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.configuredToken}`,
            "Content-Type": "application/json",
            Accept: "*/*",
            "Accept-Language": "en-US",
            "x-request-id": fbrRequestId(saleId, payloadHash),
            "User-Agent": "oil-agency-pos/0.1.0",
          },
          body: JSON.stringify(payloadForEnvironment),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      responseText = await readLimitedResponse(response);
    } catch (requestError) {
      const message = safeErrorMessage(requestError, "FBR request failed.");
      await this.fail(saleId, FBR_DB_STATUS.failed, message, userId, payloadForEnvironment);
      throw new HttpError(
        502,
        "FBR_REQUEST_FAILED",
        `FBR request failed: ${message}`,
      );
    }

    const parsed = parseFbrResponse(responseText);
    if (!response.ok) {
      const message = fbrError(response, parsed, responseText);
      await this.fail(saleId, FBR_DB_STATUS.failed, message, userId, payloadForEnvironment, responseText);
      const authenticationError =
        response.status === 401 || response.status === 403;
      throw new HttpError(
        authenticationError ? 502 : 503,
        authenticationError ? "FBR_AUTH_ERROR" : "FBR_HTTP_ERROR",
        message,
      );
    }
    if (!parsed) {
      const message = "FBR returned an invalid or unrecognized JSON response.";
      await this.fail(saleId, FBR_DB_STATUS.failed, message, userId, payloadForEnvironment, responseText);
      throw new HttpError(502, "FBR_INVALID_RESPONSE", message);
    }

    const responseIsValid = isValidFbrResponse(parsed);
    if (responseIsValid && !validateOnly && !parsed.invoiceNumber) {
      const message =
        "FBR returned a valid submission response without an invoice number.";
      await this.fail(saleId, FBR_DB_STATUS.failed, message, userId, payloadForEnvironment, responseText);
      throw new HttpError(502, "FBR_INVOICE_NUMBER_MISSING", message);
    }
    const valid = responseIsValid;
    const nextStatus = valid
      ? validateOnly
        ? FBR_DB_STATUS.pending
        : FBR_DB_STATUS.submitted
      : FBR_DB_STATUS.requires_review;
    const error = valid ? null : fbrError(response, parsed, responseText);
    const updated = await this.persistResult({
      sale,
      saleId,
      userId,
      validateOnly,
      valid,
      nextStatus,
      error,
      responseText,
      parsed,
    });
    if (!valid)
      throw new HttpError(
        422,
        "FBR_INVOICE_REJECTED",
        error ?? "FBR rejected the invoice.",
      );
    return this.result(updated);
  }

  private async persistResult(input: {
    sale: FbrSale;
    saleId: string;
    userId: string;
    validateOnly: boolean;
    valid: boolean;
    nextStatus: "PENDING" | "ACCEPTED" | "REQUIRES_REVIEW";
    error: string | null;
    responseText: string;
    parsed: FbrApiResponse;
  }) {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.sale.update({
          where: { id: input.saleId },
          data: {
            fbrStatus: input.nextStatus,
            fbrInvoiceNumber:
              !input.validateOnly && input.valid
                ? (input.parsed.invoiceNumber ?? input.sale.fbrInvoiceNumber)
                : input.sale.fbrInvoiceNumber,
            fbrResponseJson: input.responseText,
            fbrError: input.error,
            fbrSubmittedAt:
              !input.validateOnly && input.valid
                ? this.now()
                : input.sale.fbrSubmittedAt,
          },
        });
        await this.persistExtraSaleFields(
          input.saleId,
          {
            fbrQrData:
              !input.validateOnly && input.valid
                ? (input.parsed.invoiceNumber ?? input.sale.fbrInvoiceNumber)
                : input.sale.fbrInvoiceNumber,
          },
          tx,
        );
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: input.valid ? "POST" : "UPDATE",
            entityType: "FbrInvoice",
            entityId: input.saleId,
            afterJson: JSON.stringify({
              status: input.nextStatus,
              fbrInvoiceNumber: row.fbrInvoiceNumber,
              error: input.error,
            }),
          },
        });
        return row;
      });
    } catch {
      // Preserve the processing state: retrying after an unrecorded remote success can create a duplicate invoice.
      throw new HttpError(
        500,
        "FBR_RESULT_PERSIST_FAILED",
        "FBR responded, but its result could not be saved locally. Do not retry until the invoice is reconciled with the FBR portal.",
      );
    }
  }

  private async business() {
    const row = await this.db.setting.findUnique({
      where: { key: "business" },
      select: { valueJson: true },
    });
    if (!row) return DEFAULT_BUSINESS_SETTING;
    try {
      return businessSettingSchema.parse(JSON.parse(row.valueJson));
    } catch {
      throw new HttpError(
        500,
        "BUSINESS_SETTINGS_INVALID",
        "Agency settings are invalid. Correct them before submitting an FBR invoice.",
      );
    }
  }

  private async fail(
    saleId: string,
    status: "FAILED" | "REQUIRES_REVIEW",
    message: string,
    userId: string,
    payload?: FbrInvoicePayload,
    responseText?: string,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: {
          fbrStatus: status,
          fbrError: message.slice(0, 2_000),
          ...(responseText !== undefined
            ? { fbrResponseJson: responseText }
            : {}),
          ...(payload
            ? {
                fbrPayloadJson: JSON.stringify(payload),
                fbrScenarioId: payload.scenarioId ?? null,
              }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "UPDATE",
          entityType: "FbrInvoice",
          entityId: saleId,
          afterJson: JSON.stringify({ status, error: message }),
        },
      });
    });
    if (payload)
      await this.persistExtraSaleFields(saleId, {
        fbrRequestJson: JSON.stringify(payload),
      });
  }

  private async persistExtraSaleFields(
    saleId: string,
    fields: { fbrRequestJson?: string; fbrQrData?: string | null },
    client: Pick<AppDbClient, "$executeRawUnsafe"> = this.db,
  ) {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (!entries.length) return;
    const assignments = entries.map(([key]) => `"${key}" = ?`).join(", ");
    try {
      await client.$executeRawUnsafe(
        `UPDATE "Sale" SET ${assignments} WHERE "id" = ?`,
        ...entries.map(([, value]) => value),
        saleId,
      );
    } catch {
      // Older generated clients should not block the main FBR status update path.
    }
  }

  private result(sale: {
    id: string;
    fbrStatus: string;
    fbrInvoiceNumber: string | null;
    fbrError: string | null;
    fbrSubmittedAt: Date | null;
  }) {
    return {
      saleId: sale.id,
      status: publicFbrStatus(sale.fbrStatus),
      invoiceNumber: sale.fbrInvoiceNumber,
      error: sale.fbrError,
      submittedAt: sale.fbrSubmittedAt,
    };
  }
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}
function nonBlank(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = nonBlank(value);
    if (normalized) return normalized;
  }
  return undefined;
}
function normalizeToken(value: string | undefined) {
  const normalized = value?.trim().replace(/^Bearer\s+/i, "");
  if (
    !normalized ||
    /^(?:n\/?a|undefined|null|token:\s*n\/?a|sandbox security token:\s*n\/?a)$/i.test(
      normalized,
    )
  )
    return undefined;
  return normalized;
}
function endpoints(environment: "SANDBOX" | "PRODUCTION") {
  return environment === "SANDBOX"
    ? { post: FBR_SANDBOX_POST_URL, validate: FBR_SANDBOX_VALIDATE_URL }
    : { post: FBR_PRODUCTION_POST_URL, validate: FBR_PRODUCTION_VALIDATE_URL };
}
function fbrRequestId(saleId: string, payloadHash: string) {
  return `${saleId.slice(0, 24)}-${payloadHash.slice(0, 16)}`.replace(
    /[^A-Za-z0-9._-]/g,
    "-",
  );
}
function withoutSandboxScenario(payload: FbrInvoicePayload): FbrInvoicePayload {
  const { scenarioId: _scenarioId, ...productionPayload } = payload;
  return productionPayload;
}
export function publicFbrStatus(status: string) {
  switch (status) {
    case "PENDING":
    case "VALIDATING":
    case "VALIDATED":
    case "NOT_SUBMITTED":
      return "pending";
    case "SUBMITTING":
      return "submitting";
    case "ACCEPTED":
      return "submitted";
    case "FAILED":
      return "failed";
    case "REJECTED":
    case "REQUIRES_REVIEW":
      return "requires_review";
    default:
      return status.toLowerCase();
  }
}
function validateFbrLine(item: FbrSale["items"][number]) {
  const values = [
    item.quantityBase,
    item.unitPriceMinor,
    item.discountMinor,
    item.taxMinor,
    item.taxRateBps,
    item.lineTotalMinor,
    item.fbrFixedNotifiedValueMinor ?? 0,
    item.product.fbrFixedNotifiedValueMinor,
  ];
  if (
    !values.every((value) => Number.isSafeInteger(value) && value >= 0) ||
    item.quantityBase <= 0
  )
    throw new HttpError(
      422,
      "FBR_INVALID_LINE_AMOUNT",
      `Invalid quantity or amount for ${item.product.name}.`,
    );
  const grossMinor = item.unitPriceMinor * item.quantityBase;
  const notifiedValueMinor =
    (item.fbrFixedNotifiedValueMinor ??
      item.product.fbrFixedNotifiedValueMinor) * item.quantityBase;
  if (
    !Number.isSafeInteger(grossMinor) ||
    !Number.isSafeInteger(notifiedValueMinor) ||
    item.discountMinor > grossMinor
  )
    throw new HttpError(
      422,
      "FBR_INVALID_LINE_AMOUNT",
      `Invalid price or discount for ${item.product.name}.`,
    );
  if (item.lineTotalMinor !== grossMinor - item.discountMinor + item.taxMinor)
    throw new HttpError(
      422,
      "FBR_LINE_TOTAL_MISMATCH",
      `The stored line total for ${item.product.name} does not match its price, discount, and tax.`,
    );
}
function validateFbrSaleTypeRate(item: FbrSale["items"][number], saleType: string) {
  const normalizedSaleType = saleType.trim().toLowerCase();
  if (
    normalizedSaleType.includes("standard rate") &&
    item.taxRateBps <= 0
  )
    throw new HttpError(
      422,
      "FBR_RATE_SALE_TYPE_MISMATCH",
      `${item.product.name} is configured as "${saleType}" but its product tax rate is ${rate(item.taxRateBps)}. FBR requires a valid positive rate for this sale type; update the product tax rate or choose the correct FBR sale type from the DI API reference data.`,
    );
}
function pakistanDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function parseFbrResponse(value: string): FbrApiResponse | null {
  try {
    const parsed = fbrApiResponseSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function isValidFbrResponse(body: FbrApiResponse) {
  const validation = body.validationResponse;
  if (
    validation?.statusCode !== "00" ||
    validation.status?.trim().toLowerCase() !== "valid"
  )
    return false;
  const items = validation.invoiceStatuses;
  return (
    !items?.length ||
    items.every(
      (item) =>
        item.statusCode === "00" &&
        item.status?.trim().toLowerCase() === "valid",
    )
  );
}
function fbrError(
  response: Response,
  body: FbrApiResponse | null,
  raw: string,
) {
  const validation = body?.validationResponse;
  const messages: string[] = [];
  if (validation?.error)
    messages.push(withCode(validation.error, validation.errorCode));
  for (const item of validation?.invoiceStatuses ?? []) {
    if (item.error)
      messages.push(
        `Item ${item.itemSNo ?? "?"}: ${withCode(item.error, item.errorCode)}`,
      );
  }
  const unique = [
    ...new Set(
      messages.map((message) => cleanExternalText(message)).filter(Boolean),
    ),
  ];
  if (unique.length) return unique.join("; ").slice(0, 2_000);
  const detail =
    cleanExternalText(raw) ||
    cleanExternalText(response.statusText) ||
    "No error detail was returned.";
  return `FBR returned HTTP ${response.status}: ${detail}`.slice(0, 2_000);
}
function withCode(message: string, code?: string | null) {
  const normalizedCode = nonBlank(code);
  return normalizedCode ? `[${normalizedCode}] ${message}` : message;
}
function cleanExternalText(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(security[-_\s]?token["':\s]+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
}
function safeErrorMessage(error: unknown, fallback: string) {
  return (
    cleanExternalText(error instanceof Error ? error.message : fallback) ||
    fallback
  );
}
async function readLimitedResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_FBR_RESPONSE_BYTES
  )
    throw new Error("FBR response exceeded the 1 MB safety limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FBR_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("FBR response exceeded the 1 MB safety limit.");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}
