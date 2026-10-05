import { describe, expect, it } from "vitest";
import { acceleratorsOf, matchesAccelerator, type DesktopMenu } from "./desktop";

const key = (k: string, code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("matchesAccelerator", () => {
  it("treats CmdOrCtrl as Ctrl and requires the exact modifiers", () => {
    expect(matchesAccelerator(key("n", "KeyN", { ctrlKey: true }), "CmdOrCtrl+N")).toBe(true);
    expect(matchesAccelerator(key("N", "KeyN", { ctrlKey: true, shiftKey: true }), "CmdOrCtrl+N")).toBe(false);
    expect(matchesAccelerator(key("N", "KeyN", { ctrlKey: true, shiftKey: true }), "CmdOrCtrl+Shift+N")).toBe(true);
    expect(matchesAccelerator(key("n", "KeyN"), "CmdOrCtrl+N")).toBe(false);
    expect(matchesAccelerator(key("n", "KeyN", { ctrlKey: true, altKey: true }), "CmdOrCtrl+Alt+N")).toBe(true);
  });

  it("matches digits by physical key and named keys by value", () => {
    expect(matchesAccelerator(key("1", "Digit1", { ctrlKey: true }), "CmdOrCtrl+1")).toBe(true);
    expect(matchesAccelerator(key("ArrowLeft", "ArrowLeft", { altKey: true }), "Alt+Left")).toBe(true);
    expect(matchesAccelerator(key("F5", "F5"), "F5")).toBe(true);
    expect(matchesAccelerator(key("F5", "F5", { ctrlKey: true }), "F5")).toBe(false);
  });

  it("matches punctuation by character, accepting + for =", () => {
    expect(matchesAccelerator(key(",", "Comma", { ctrlKey: true }), "Ctrl+,")).toBe(true);
    expect(matchesAccelerator(key("+", "Equal", { ctrlKey: true, shiftKey: true }), "CmdOrCtrl+=")).toBe(true);
    expect(matchesAccelerator(key("-", "Minus", { ctrlKey: true }), "CmdOrCtrl+-")).toBe(true);
  });
});

describe("acceleratorsOf", () => {
  it("flattens submenus and skips separators, editing roles and disabled items", () => {
    const menus: DesktopMenu[] = [
      {
        id: "file",
        label: "Arquivo",
        items: [
          { id: "app:new-plan", label: "Novo plan", accelerator: "CmdOrCtrl+N" },
          { type: "separator" },
          { id: "export", label: "Exportar", submenu: [{ id: "app:export-html", label: "HTML", accelerator: "CmdOrCtrl+E" }] },
          { id: "off", label: "Off", accelerator: "CmdOrCtrl+O", enabled: false },
        ],
      },
      { id: "edit", label: "Editar", items: [{ id: "role:copy", label: "Copiar", accelerator: "CmdOrCtrl+C" }] },
    ];
    expect(acceleratorsOf(menus)).toEqual([
      { accelerator: "CmdOrCtrl+N", id: "app:new-plan" },
      { accelerator: "CmdOrCtrl+E", id: "app:export-html" },
    ]);
  });
});
