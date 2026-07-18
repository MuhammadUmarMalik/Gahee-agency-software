export const BUSINESS_TIME_ZONE = "Asia/Karachi";
export const AUTOMATIC_CLOSING_HOUR = 20;

export function pakistanDate(instant = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function pakistanDay(date: string) {
  return { start: new Date(`${date}T00:00:00+05:00`), end: new Date(`${date}T23:59:59.999+05:00`), businessDate: new Date(`${date}T12:00:00.000Z`) };
}

export function pakistanBusinessDate(instant = new Date()): Date {
  return pakistanDay(pakistanDate(instant)).businessDate;
}

function adjacentDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function automaticClosingDate(instant = new Date()): string {
  const today = pakistanDate(instant);
  const cutoff = new Date(`${today}T${String(AUTOMATIC_CLOSING_HOUR).padStart(2, "0")}:00:00+05:00`);
  return instant >= cutoff ? today : adjacentDate(today, -1);
}

export function nextAutomaticClosingAt(instant = new Date()): Date {
  const today = pakistanDate(instant);
  const todayCutoff = new Date(`${today}T${String(AUTOMATIC_CLOSING_HOUR).padStart(2, "0")}:00:00+05:00`);
  return instant < todayCutoff ? todayCutoff : new Date(`${adjacentDate(today, 1)}T${String(AUTOMATIC_CLOSING_HOUR).padStart(2, "0")}:00:00+05:00`);
}
