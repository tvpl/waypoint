import { describe, expect, it } from "vitest";
import { History } from "./history";

describe("History", () => {
  it("undoes and redoes", () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    expect(h.present).toBe(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.undo()).toBeNull();
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(1);
    expect(h.redo()).toBe(2);
    expect(h.redo()).toBeNull();
  });

  it("clears the redo branch on a new push", () => {
    const h = new History("a");
    h.push("b");
    h.undo();
    h.push("c");
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe("a");
  });

  it("coalesces pushes with the same key inside the window", () => {
    const h = new History("", { coalesceMs: 1000 });
    h.push("A", "title", 0);
    h.push("Ap", "title", 300);
    h.push("Api", "title", 600);
    expect(h.size.past).toBe(1);
    expect(h.undo()).toBe("");
  });

  it("does not coalesce across keys, time or after undo", () => {
    const h = new History(0, { coalesceMs: 1000 });
    h.push(1, "x", 0);
    h.push(2, "y", 10);
    h.push(3, "y", 5000);
    expect(h.size.past).toBe(3);
    h.undo();
    h.push(9, "y", 5001);
    expect(h.size.past).toBe(3);
  });

  it("caps the history", () => {
    const h = new History(0, { limit: 100 });
    for (let i = 1; i <= 150; i++) h.push(i);
    expect(h.size.past).toBe(100);
    let last: number | null = null;
    while (h.canUndo) last = h.undo();
    expect(last).toBe(50);
  });

  it("reset replaces the present without a step", () => {
    const h = new History(1);
    h.push(2);
    h.reset(5);
    expect(h.present).toBe(5);
    expect(h.canUndo).toBe(false);
  });
});
