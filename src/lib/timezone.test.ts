import { describe, expect, it } from "vitest";
import { addDaysIso, dayInZone, isTimeZone, weekdayIso } from "./timezone";

describe("time zones", () => {
  it("reads the calendar day in a zone", () => {
    const instant = Date.parse("2026-10-19T01:30:00Z");
    expect(dayInZone(instant, "UTC")).toBe("2026-10-19");
    expect(dayInZone(instant, "America/Sao_Paulo")).toBe("2026-10-18");
    expect(dayInZone(instant, "Asia/Tokyo")).toBe("2026-10-19");
    expect(dayInZone(instant, "Nada/Isso")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("does calendar arithmetic", () => {
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekdayIso("2026-10-19")).toBe(0); // Monday
    expect(weekdayIso("2026-10-18")).toBe(6); // Sunday
  });
  it("validates zone names", () => {
    expect(isTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("x; drop")).toBe(false);
  });
});
