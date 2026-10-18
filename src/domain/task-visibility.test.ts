import { describe, expect, it } from "vitest";
import { describeHideRules, hiddenByRules, noHideRules, ruleCutoff } from "./task-visibility";
import { STATUS_LABELS } from "./tasks";

const now = new Date(2026, 9, 15, 10, 0); // Thursday 15 Oct 2026
const t = (status: "todo" | "doing" | "waiting" | "done", created: Date, completed?: Date) => ({
  status,
  createdAt: created.valueOf(),
  completedAt: completed?.valueOf() ?? null,
});

describe("hide rules", () => {
  it("shows everything by default", () => {
    expect(hiddenByRules(t("done", new Date(2020, 0, 1), new Date(2020, 0, 2)), noHideRules(), now)).toBe(false);
  });
  it("hides a whole stage", () => {
    const rules = { ...noHideRules(), doing: "all" as const };
    expect(hiddenByRules(t("doing", now), rules, now)).toBe(true);
    expect(hiddenByRules(t("todo", now), rules, now)).toBe(false);
  });
  it("uses the completion date for done tasks and the creation date for the others", () => {
    const rules = { ...noHideRules(), done: "before-month" as const, todo: "before-today" as const };
    expect(hiddenByRules(t("done", new Date(2026, 7, 1), new Date(2026, 8, 30)), rules, now)).toBe(true);
    expect(hiddenByRules(t("done", new Date(2026, 7, 1), new Date(2026, 9, 1)), rules, now)).toBe(false);
    expect(hiddenByRules(t("todo", new Date(2026, 9, 14, 23)), rules, now)).toBe(true);
    expect(hiddenByRules(t("todo", new Date(2026, 9, 15, 0, 5)), rules, now)).toBe(false);
  });
  it("cuts weeks on Monday and respects exempt stages", () => {
    expect(new Date(ruleCutoff("before-week", now)!).getDate()).toBe(12);
    const rules = { ...noHideRules(), done: "all" as const };
    expect(hiddenByRules(t("done", now, now), rules, now, ["done"])).toBe(false);
  });
  it("describes active rules", () => {
    expect(describeHideRules({ ...noHideRules(), done: "before-month", waiting: "all" }, STATUS_LABELS)).toBe("Aguardando · Concluído antes deste mês");
  });
});
