import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { automaticClosingDate, nextAutomaticClosingAt, pakistanDay } from "../../lib/business-time.js";

const RETRY_DELAY_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const AUTOMATIC_NOTE = "Automatically closed at 8:00 PM Asia/Karachi; counted cash set to system expected cash.";

type SchedulerLogger = Pick<Console, "info" | "error">;
type CashRow = { direction: "IN" | "OUT"; entryType: string; amountMinor: number };
type AutomaticClosingResult =
  | { businessDate: string; created: boolean; skipped?: undefined }
  | { businessDate: string; created: false; skipped: "NO_CLOSING_USER" };

export async function runAutomaticClosing(databasePath: string, instant = new Date(), logger: SchedulerLogger = console): Promise<AutomaticClosingResult> {
  const businessDate = automaticClosingDate(instant);
  const day = pakistanDay(businessDate);
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");

  try {
    const result = sqlite.transaction(() => {
      const existing = sqlite.prepare("SELECT id FROM DailyClosing WHERE businessDate = ? LIMIT 1").get(day.businessDate.toISOString());
      if (existing) return { businessDate, created: false as const };

      const user = sqlite.prepare(`
        SELECT User.id
        FROM User
        INNER JOIN Role ON Role.id = User.roleId
        WHERE User.isActive = 1
          AND User.deletedAt IS NULL
          AND Role.code IN ('OWNER', 'ADMIN')
        ORDER BY CASE Role.code WHEN 'OWNER' THEN 0 ELSE 1 END, User.createdAt ASC
        LIMIT 1
      `).get() as { id: string } | undefined;
      if (!user) return { businessDate, created: false as const, skipped: "NO_CLOSING_USER" as const };

      const entries = sqlite.prepare(`
        SELECT direction, entryType, amountMinor
        FROM CashbookEntry
        WHERE occurredAt >= ? AND occurredAt <= ?
      `).all(day.start.toISOString(), day.end.toISOString()) as CashRow[];
      const totals = cashTotals(entries);
      const closingId = randomUUID();
      const now = new Date().toISOString();
      sqlite.prepare(`
        INSERT INTO DailyClosing (
          id, businessDate, openingCashMinor, cashInMinor, cashOutMinor,
          expectedCashMinor, countedCashMinor, differenceMinor, notes,
          closedById, closedAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        closingId,
        day.businessDate.toISOString(),
        totals.openingCashMinor,
        totals.cashInMinor,
        totals.cashOutMinor,
        totals.expectedCashMinor,
        totals.expectedCashMinor,
        AUTOMATIC_NOTE,
        user.id,
        now,
        now,
      );
      sqlite.prepare(`
        INSERT INTO AuditLog (id, userId, action, entityType, entityId, afterJson, createdAt)
        VALUES (?, ?, 'CLOSE', 'DailyClosing', ?, ?, ?)
      `).run(
        randomUUID(),
        user.id,
        closingId,
        JSON.stringify({ businessDate, ...totals, countedCashMinor: totals.expectedCashMinor, differenceMinor: 0, automatic: true, timezone: "Asia/Karachi", scheduledHour: 20 }),
        now,
      );
      return { businessDate, created: true as const };
    })();

    if (result.created) logger.info(`Automatic daily closing completed for ${businessDate} at 8:00 PM Asia/Karachi.`);
    return result;
  } finally {
    sqlite.close();
  }
}

export function startDailyClosingScheduler(databasePath: string, logger: SchedulerLogger = console) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => void checkAndSchedule(), Math.min(delay, MAX_TIMER_DELAY_MS));
    timer.unref?.();
  };
  const checkAndSchedule = async () => {
    const checkedAt = new Date();
    try {
      const result = await runAutomaticClosing(databasePath, checkedAt, logger);
      schedule(result.skipped === "NO_CLOSING_USER" ? RETRY_DELAY_MS : Math.max(1_000, nextAutomaticClosingAt(checkedAt).getTime() - Date.now() + 250));
    } catch (error) {
      logger.error("Automatic daily closing failed; retrying in one minute.", error);
      schedule(RETRY_DELAY_MS);
    }
  };

  void checkAndSchedule();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

function cashTotals(entries: CashRow[]) {
  const openingCashMinor = entries.filter((entry) => entry.entryType === "OPENING_CASH").reduce((sum, entry) => sum + entry.amountMinor, 0);
  const cashInMinor = entries.filter((entry) => entry.direction === "IN" && entry.entryType !== "OPENING_CASH").reduce((sum, entry) => sum + entry.amountMinor, 0);
  const cashOutMinor = entries.filter((entry) => entry.direction === "OUT").reduce((sum, entry) => sum + entry.amountMinor, 0);
  return { openingCashMinor, cashInMinor, cashOutMinor, expectedCashMinor: openingCashMinor + cashInMinor - cashOutMinor };
}
