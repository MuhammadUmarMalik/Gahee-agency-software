import { describe, expect, it } from "vitest";
import { automaticClosingDate, nextAutomaticClosingAt, pakistanBusinessDate, pakistanDate } from "./business-time.js";

describe("Pakistan business time", () => {
  it("uses the Pakistan calendar date around the UTC date boundary", () => {
    const instant = new Date("2026-07-18T20:30:00.000Z");
    expect(pakistanDate(instant)).toBe("2026-07-19");
    expect(pakistanBusinessDate(instant).toISOString()).toBe("2026-07-19T12:00:00.000Z");
  });

  it("closes yesterday before 8 PM and today from exactly 8 PM", () => {
    expect(automaticClosingDate(new Date("2026-07-18T14:59:59.999Z"))).toBe("2026-07-17");
    expect(automaticClosingDate(new Date("2026-07-18T15:00:00.000Z"))).toBe("2026-07-18");
  });

  it("schedules the next close at exactly 8 PM Pakistan time", () => {
    expect(nextAutomaticClosingAt(new Date("2026-07-18T10:00:00.000Z")).toISOString()).toBe("2026-07-18T15:00:00.000Z");
    expect(nextAutomaticClosingAt(new Date("2026-07-18T15:00:00.000Z")).toISOString()).toBe("2026-07-19T15:00:00.000Z");
  });
});
