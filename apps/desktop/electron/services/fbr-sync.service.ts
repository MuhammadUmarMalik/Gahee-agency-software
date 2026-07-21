import type { AppDbClient, BackupKind, JobType, JobStatus } from "../../../api/src/lib/db.js";
import { businessSettingSchema, DEFAULT_BUSINESS_SETTING } from "@oil-agency/shared";
import { FbrService, publicFbrStatus } from "../../../api/src/modules/fbr/fbr.service.js";
import { HttpError } from "../../../api/src/lib/http-error.js";
import type { JobQueueService } from "./job-queue.service.js";
import type { NetworkService } from "./network.service.js";
import type { SecureStorageService } from "./secure-storage.service.js";

const tokenKey = (environment: "SANDBOX" | "PRODUCTION") => `fbr.${environment.toLowerCase()}.security-token`;

export interface FbrQueuePayload {
  saleId: string;
  userId: string;
}

export class FbrSyncService {
  private running = false;

  constructor(
    private readonly db: AppDbClient,
    private readonly jobs: JobQueueService,
    private readonly network: NetworkService,
    private readonly secureStorage: SecureStorageService,
  ) {}

  async tokenStatus() {
    const environment = await this.environment();
    return {
      environment,
      configured: Boolean(await this.secureStorage.get(tokenKey(environment))),
      sandboxConfigured: Boolean(await this.secureStorage.get(tokenKey("SANDBOX"))),
      productionConfigured: Boolean(await this.secureStorage.get(tokenKey("PRODUCTION"))),
    };
  }

  async setToken(token: string, environment?: "SANDBOX" | "PRODUCTION") {
    const target = environment ?? await this.environment();
    const normalized = token.trim().replace(/^Bearer\s+/i, "");
    if (!normalized || /^(?:n\/?a|undefined|null)$/i.test(normalized)) throw new Error("Enter the security token issued by PRAL/FBR.");
    await this.secureStorage.set(tokenKey(target), normalized);
    return { configured: true, environment: target };
  }

  async clearToken(environment?: "SANDBOX" | "PRODUCTION") {
    const target = environment ?? await this.environment();
    await this.secureStorage.delete(tokenKey(target));
    return { configured: false, environment: target };
  }

  async testConnection(environment?: "SANDBOX" | "PRODUCTION") {
    const target = environment ?? await this.environment();
    const token = await this.secureStorage.get(tokenKey(target));
    return new FbrService(this.db, {
      ...(token ? { token } : {}),
      environment: target,
    }).testConnection();
  }

  async seedPending() {
    const sales = await this.db.sale.findMany({ where: { status: "POSTED", fbrStatus: "PENDING" }, select: { id: true, createdById: true }, orderBy: { soldAt: "asc" } });
    for (const sale of sales) await this.jobs.enqueue("FBR_SUBMIT", `fbr:${sale.id}`, { saleId: sale.id, userId: sale.createdById });
  }

  async processPending(limit = 100) {
    if (this.running || !this.network.isOnline()) return { processed: 0 };
    const environment = await this.environment();
    const token = await this.secureStorage.get(tokenKey(environment));
    if (!token) return { processed: 0 };
    this.running = true;
    let processed = 0;
    try {
      while (processed < limit) {
        const job = await this.jobs.claim("FBR_SUBMIT");
        if (!job) break;
        let payload: FbrQueuePayload | null = null;
        try {
          payload = parsePayload(job.payloadJson);
          const service = new FbrService(this.db, { token, environment });
          const sale = await this.db.sale.findUnique({ where: { id: payload.saleId }, select: { fbrStatus: true } });
          if (!sale || sale.fbrStatus === "ACCEPTED") { await this.jobs.complete(job.id); processed++; continue; }
          await service.submit(payload.saleId, payload.userId, true);
          await service.submit(payload.saleId, payload.userId, false);
          await this.jobs.complete(job.id);
        } catch (error) {
          if (retryable(error)) {
            const retry = await this.jobs.retry(job.id, error);
            if (payload) await this.db.sale.updateMany({ where: { id: payload.saleId, fbrStatus: { not: "ACCEPTED" } }, data: { fbrStatus: retry.exhausted ? "FAILED" : "PENDING", fbrError: safeMessage(error) } });
          } else {
            if (payload) await this.db.sale.updateMany({ where: { id: payload.saleId, fbrStatus: { not: "ACCEPTED" } }, data: { fbrStatus: "REQUIRES_REVIEW", fbrError: safeMessage(error) } });
            await this.jobs.review(job.id, error);
          }
        }
        processed++;
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }

  async list() {
    const jobs = await this.db.backgroundJob.findMany({ where: { type: "FBR_SUBMIT" }, orderBy: { createdAt: "desc" }, take: 500 });
    const payloads = new Map(jobs.map((job) => [job.id, safeParsePayload(job.payloadJson)]));
    const saleIds = [...new Set([...payloads.values()].flatMap((row) => row ? [row.saleId] : []))];
    const sales = saleIds.length
      ? await this.db.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, invoiceNumber: true, soldAt: true, fbrStatus: true, fbrInvoiceNumber: true, fbrError: true, fbrSubmittedAt: true } })
      : [];
    const byId = new Map(sales.map((sale) => [sale.id, { ...sale, fbrStatus: publicFbrStatus(sale.fbrStatus) }]));
    return jobs.map((job) => {
      const payload = payloads.get(job.id);
      return { id: job.id, status: job.status, attempts: job.attempts, nextRunAt: job.nextRunAt, lastError: job.lastError, createdAt: job.createdAt, sale: payload ? byId.get(payload.saleId) ?? null : null };
    });
  }

  async retry(jobId: string) {
    const job = await this.db.backgroundJob.findFirst({ where: { id: jobId, type: "FBR_SUBMIT" } });
    if (!job) throw new Error("FBR queue item was not found.");
    const payload = parsePayload(job.payloadJson);
    await this.db.sale.updateMany({ where: { id: payload.saleId, fbrStatus: { not: "ACCEPTED" } }, data: { fbrStatus: "PENDING", fbrError: null } });
    await this.jobs.retryNow(job.id);
    void this.processPending();
    return { queued: true };
  }

  async validate(saleId: string, userId: string) {
    return this.runManual(saleId, userId, true);
  }

  async submit(saleId: string, userId: string) {
    return this.runManual(saleId, userId, false);
  }

  private async runManual(saleId: string, userId: string, validateOnly: boolean) {
    const environment = await this.environment();
    const token = await this.secureStorage.get(tokenKey(environment));
    if (!token) {
      await this.jobs.enqueue("FBR_SUBMIT", `fbr:${saleId}`, { saleId, userId });
      await this.db.sale.updateMany({ where: { id: saleId, fbrStatus: { not: "ACCEPTED" } }, data: { fbrStatus: "PENDING", fbrError: "FBR token is not configured for the selected environment." } });
      return { queued: true, status: "pending" };
    }
    const result = await new FbrService(this.db, { token, environment }).submit(saleId, userId, validateOnly);
    if (!validateOnly && result.status !== "submitted") await this.jobs.enqueue("FBR_SUBMIT", `fbr:${saleId}`, { saleId, userId });
    return result;
  }

  private async environment(): Promise<"SANDBOX" | "PRODUCTION"> {
    const setting = await this.db.setting.findUnique({ where: { key: "business" }, select: { valueJson: true } });
    if (!setting) return DEFAULT_BUSINESS_SETTING.fbrEnvironment;
    try { return businessSettingSchema.parse(JSON.parse(setting.valueJson)).fbrEnvironment; }
    catch { return DEFAULT_BUSINESS_SETTING.fbrEnvironment; }
  }
}

function parsePayload(value: string): FbrQueuePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("FBR queue payload contains malformed JSON.");
  }
  if (!isFbrQueuePayload(parsed)) throw new Error("FBR queue payload is invalid.");
  return parsed;
}
function safeParsePayload(value: string): FbrQueuePayload | null {
  try {
    return parsePayload(value);
  } catch {
    return null;
  }
}
function isFbrQueuePayload(value: unknown): value is FbrQueuePayload {
  if (!value || typeof value !== "object") return false;
  if (!("saleId" in value) || !("userId" in value)) return false;
  return typeof value.saleId === "string" && value.saleId.length > 0 && typeof value.userId === "string" && value.userId.length > 0;
}
function retryable(error: unknown) { return error instanceof HttpError && (error.code === "FBR_REQUEST_FAILED" || (error.code === "FBR_HTTP_ERROR" && error.status >= 500)); }
function safeMessage(error: unknown) { return (error instanceof Error ? error.message : "FBR synchronization failed.").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]").replace(/(security[-_\s]?token["':\s]+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2_000); }
