import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./task-recurrence";
import { parseQuickTask } from "./task-capture";

describe("recurrence", () => {
  it("steps from the due date and rolls past today", () => {
    expect(nextOccurrence("daily", "2026-10-18", "2026-10-10")).toBe("2026-10-19");
    expect(nextOccurrence("daily", "2026-10-01", "2026-10-18")).toBe("2026-10-19");
    expect(nextOccurrence("weekly", "2026-10-15", "2026-10-15")).toBe("2026-10-22");
    expect(nextOccurrence("weekdays", "2026-10-16", "2026-10-10")).toBe("2026-10-19"); // Fri → Mon
    expect(nextOccurrence("monthly", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("monthly", "2026-01-31", "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence("daily", null, "2026-10-18")).toBe("2026-10-19");
  });
  it("reads ~tokens in quick capture", () => {
    expect(parseQuickTask("Relatório ~semanal #fin", {}, "2026-10-18")).toMatchObject({ title: "Relatório", recurrence: "weekly", tags: ["fin"] });
    expect(parseQuickTask("Café ~nunca").title).toBe("Café ~nunca");
  });
});
