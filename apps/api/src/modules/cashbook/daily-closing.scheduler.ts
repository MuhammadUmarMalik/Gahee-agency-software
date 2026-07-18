import type { PrismaClient } from "@prisma/client";
import { automaticClosingDate, nextAutomaticClosingAt } from "../../lib/business-time.js";
import { CashbookService } from "./cashbook.service.js";

const RETRY_DELAY_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

type SchedulerLogger = Pick<Console, "info" | "error">;

export async function runAutomaticClosing(db: PrismaClient, instant = new Date(), logger: SchedulerLogger = console) {
  const businessDate = automaticClosingDate(instant);
  const day = new Date(`${businessDate}T12:00:00.000Z`);
  if (await db.dailyClosing.findUnique({ where: { businessDate: day }, select: { id: true } })) return { businessDate, created: false as const };
  const user = await db.user.findFirst({ where: { isActive: true, deletedAt: null, role: { code: "OWNER" } }, select: { id: true } })
    ?? await db.user.findFirst({ where: { isActive: true, deletedAt: null, role: { code: "ADMIN" } }, select: { id: true } });
  if (!user) throw new Error("Automatic daily closing requires an active owner or administrator.");
  const result = await new CashbookService(db).closeAutomatically(businessDate, user.id);
  if (result.created) logger.info(`Automatic daily closing completed for ${businessDate} at 8:00 PM Asia/Karachi.`);
  return { businessDate, created: result.created };
}

export function startDailyClosingScheduler(db: PrismaClient, logger: SchedulerLogger = console) {
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
      await runAutomaticClosing(db, checkedAt, logger);
      schedule(Math.max(1_000, nextAutomaticClosingAt(checkedAt).getTime() - Date.now() + 250));
    } catch (error) {
      logger.error("Automatic daily closing failed; retrying in one minute.", error);
      schedule(RETRY_DELAY_MS);
    }
  };

  void checkAndSchedule();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
