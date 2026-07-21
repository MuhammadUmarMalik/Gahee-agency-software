import type { AppDbClient, BackupKind, JobType, JobStatus } from "../../../api/src/lib/db.js";

const retryDelay = (attempt: number) => Math.min(60 * 60_000, 15_000 * 2 ** Math.min(attempt, 8));

export class JobQueueService {
  constructor(private readonly db: AppDbClient) {}

  async enqueue(type: JobType, dedupeKey: string, payload: unknown, maxAttempts = 12) {
    return this.db.backgroundJob.upsert({
      where: { dedupeKey },
      create: { type, dedupeKey, payloadJson: JSON.stringify(payload), maxAttempts },
      update: {},
    });
  }

  async claim(type: JobType) {
    const now = new Date();
    const stale = new Date(now.getTime() - 10 * 60_000);
    const candidate = await this.db.backgroundJob.findFirst({
      where: {
        type,
        OR: [
          { status: "PENDING", nextRunAt: { lte: now } },
          { status: "PROCESSING", lockedAt: { lt: stale } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) return null;
    const claimed = await this.db.backgroundJob.updateMany({
      where: { id: candidate.id, updatedAt: candidate.updatedAt },
      data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
    });
    return claimed.count ? this.db.backgroundJob.findUnique({ where: { id: candidate.id } }) : null;
  }

  async complete(id: string) {
    await this.db.backgroundJob.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lastError: null } });
  }

  async retry(id: string, error: unknown) {
    const job = await this.db.backgroundJob.findUniqueOrThrow({ where: { id } });
    const exhausted = job.attempts >= job.maxAttempts;
    await this.db.backgroundJob.update({
      where: { id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        lockedAt: null,
        lastError: message(error),
        nextRunAt: new Date(Date.now() + retryDelay(job.attempts)),
      },
    });
    return { exhausted };
  }

  async review(id: string, error: unknown) {
    await this.db.backgroundJob.update({ where: { id }, data: { status: "REQUIRES_REVIEW", lockedAt: null, lastError: message(error) } });
  }

  async retryNow(id: string) {
    return this.db.backgroundJob.update({ where: { id }, data: { status: "PENDING", attempts: 0, nextRunAt: new Date(), lockedAt: null, lastError: null, completedAt: null } });
  }

  async list(type?: JobType, status?: JobStatus) {
    return this.db.backgroundJob.findMany({ where: { ...(type ? { type } : {}), ...(status ? { status } : {}) }, orderBy: [{ createdAt: "desc" }], take: 500 });
  }
}

function message(error: unknown) {
  return (error instanceof Error ? error.message : "Background job failed.").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2_000);
}
