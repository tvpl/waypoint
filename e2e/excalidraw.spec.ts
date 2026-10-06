import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { signUp } from "./helpers";

const scene = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [
    { id: "r1", type: "rectangle", x: 0, y: 0, width: 180, height: 80, strokeColor: "#1e1e1e", backgroundColor: "#a5d8ff", roughness: 1, boundElements: [{ id: "t1", type: "text" }, { id: "a1", type: "arrow" }] },
    { id: "t1", type: "text", x: 50, y: 28, width: 80, height: 25, text: "Cliente", originalText: "Cliente", containerId: "r1", fontFamily: 5, fontSize: 20 },
    { id: "d1", type: "diamond", x: 320, y: -20, width: 140, height: 120, strokeColor: "#1e1e1e", backgroundColor: "transparent", boundElements: [{ id: "a1", type: "arrow" }] },
    { id: "a1", type: "arrow", x: 185, y: 40, width: 130, height: 0, points: [[0, 0], [130, 0]], startBinding: { elementId: "r1" }, endBinding: { elementId: "d1" }, endArrowhead: "arrow" },
  ],
  appState: {},
  files: {},
};

test("Excalidraw: a drawing becomes a plan, and the plan goes back as a .excalidraw file", async ({ page }) => {
  await signUp(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Importar do Excalidraw" }).click();
  await (await chooser).setFiles({ name: "fluxo.excalidraw", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scene)) });
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/, { timeout: 20_000 });
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(2);
  await expect(page.locator(".react-flow__node-shape").filter({ hasText: "Cliente" })).toBeVisible();
  await expect(page.locator(".react-flow__edge.wp-drawn-edge")).toHaveCount(1);

  await page.getByRole("button", { name: "Mais opções" }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Arquivo .excalidraw" }).click();
  const file = await (await download).path();
  const out = JSON.parse(await readFile(file!, "utf8")) as typeof scene;
  expect(out.type).toBe("excalidraw");
  const arrow = out.elements.find((e) => e.type === "arrow")!;
  expect(arrow.startBinding?.elementId).toBe("r1");
  expect(arrow.endBinding?.elementId).toBe("d1");
  expect(out.elements.find((e) => e.type === "text")?.text).toBe("Cliente");
});
