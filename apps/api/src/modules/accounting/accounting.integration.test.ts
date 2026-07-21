import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AppDbClient } from "../../lib/db.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountingPostingService } from "./posting.service.js";
import { AccountingService } from "./accounting.service.js";

describe("accounting database integration", () => {
  let directory = "", databaseUrl = "", db: AppDbClient, userId = "";
  beforeAll(async () => {
    directory = await mkdtemp(resolve(tmpdir(), "oil-agency-accounting-"));
    databaseUrl = `file:${resolve(directory, "accounting.db").replaceAll("\\", "/")}`;
    const repositoryRoot = resolve(process.cwd(), "../..");
    const drizzleKit = resolve(repositoryRoot, "node_modules/drizzle-kit/bin.cjs");
    execFileSync(process.execPath, [drizzleKit, "migrate", "--config", resolve(repositoryRoot, "drizzle.config.ts")], { cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
    process.env.DATABASE_URL = databaseUrl;
    db = (await import("../../lib/db.js")).db;
    const role = await db.role.create({ data: { code: "OWNER", name: "Owner" } });
    const user = await db.user.create({ data: { username: "integration-owner", displayName: "Integration Owner", passwordHash: "not-used", roleId: role.id } }); userId = user.id;
  }, 30_000);
  afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

  it("commits one balanced source journal, prevents duplicates, and reverses immutably", async () => {
    const date = new Date("2026-07-17T12:00:00.000Z");
    const first = await db.$transaction((tx) => AccountingPostingService.post(tx, { sourceType: "MANUAL_ADJUSTMENT", sourceId: "integration-opening", transactionDate: date, description: "Integration opening", createdById: userId, lines: [{ systemCode: "CASH", debitMinor: 25_000 }, { systemCode: "OPENING_EQUITY", creditMinor: 25_000 }] }));
    const duplicate = await db.$transaction((tx) => AccountingPostingService.post(tx, { sourceType: "MANUAL_ADJUSTMENT", sourceId: "integration-opening", transactionDate: date, description: "Integration opening", createdById: userId, lines: [{ systemCode: "CASH", debitMinor: 25_000 }, { systemCode: "OPENING_EQUITY", creditMinor: 25_000 }] }));
    expect(duplicate.id).toBe(first.id); expect(await db.journalEntry.count({ where: { sourceId: "integration-opening" } })).toBe(1);
    const journal = await db.journalEntry.findUniqueOrThrow({ where: { id: first.id }, include: { lines: true } });
    expect(journal.lines.reduce((sum, line) => sum + line.debitMinor, 0)).toBe(journal.lines.reduce((sum, line) => sum + line.creditMinor, 0));
    const reversal = await db.$transaction((tx) => AccountingPostingService.reverse(tx, first.id, "Integration correction", userId, date));
    expect((await db.journalEntry.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("REVERSED");
    expect((await db.journalEntry.findUniqueOrThrow({ where: { id: reversal.id } })).reversalOfId).toBe(first.id);
  });

  it("produces a balanced journal-sourced trial balance", async () => {
    const result = await new AccountingService(db).trialBalance({ from: "2026-01-01", to: "2026-12-31" });
    expect(result.totals.balanced).toBe(true); expect(result.totals.debit).toBe(result.totals.credit);
  });
});
