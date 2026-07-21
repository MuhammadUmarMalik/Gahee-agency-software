import { describe, expect, it, vi } from "vitest";
import type { AppDbClient, BackupKind, JobType, JobStatus } from "../../../api/src/lib/db.js";
import { JobQueueService } from "./job-queue.service.js";

describe("persistent background job queue", () => {
  it("uses a unique dedupe key when enqueueing work", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-1" });
    const queue = new JobQueueService({ backgroundJob: { upsert } } as unknown as AppDbClient);
    await queue.enqueue("FBR_SUBMIT", "fbr:sale-1", { saleId: "sale-1" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupeKey: "fbr:sale-1" }, update: {} }));
  });

  it("recovers stale processing jobs after an interrupted app session", async () => {
    const candidate = { id: "job-1", updatedAt: new Date("2026-07-20T00:00:00Z") };
    const findFirst = vi.fn().mockResolvedValue(candidate);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue({ ...candidate, status: "PROCESSING" });
    const queue = new JobQueueService({ backgroundJob: { findFirst, updateMany, findUnique } } as unknown as AppDbClient);
    await expect(queue.claim("GOOGLE_DRIVE_UPLOAD")).resolves.toMatchObject({ status: "PROCESSING" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({ status: "PROCESSING" })]) }) }));
  });
});
