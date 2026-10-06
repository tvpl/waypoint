import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test("drawing: more shapes, rotation, ⌥-drag copy, lock, hide and a bent arrow", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: pane.x + pane.width * fx, y: pane.y + pane.height * fy });
  const shapes = page.locator(".react-flow__node-shape");

  // "Mais formas": a cylinder and a cloud.
  for (const [name, x] of [["Cilindro", 0.15], ["Nuvem", 0.45]] as const) {
    await page.getByRole("button", { name: "Mais formas" }).click();
    await page.getByRole("menuitem", { name }).click();
    await drag(page, at(x, 0.2), at(x + 0.15, 0.4));
    await page.keyboard.press("Escape");
  }
  await expect(shapes).toHaveCount(2);

  // Rotate and shade the cylinder from the properties.
  await shapes.first().click();
  await page.getByRole("button", { name: "Transformar" }).click();
  await page.getByRole("button", { name: "Girar 90° à direita" }).click();
  await page.getByRole("switch", { name: "Sombra suave" }).click();
  await expect(shapes.first().locator(".wp-shape")).toHaveAttribute("style", /rotate\(90deg\)/);

  // ⌥-drag leaves a copy behind.
  await page.mouse.click(pane.x + 8, pane.y + pane.height - 8);
  const c = (await shapes.nth(1).boundingBox())!;
  await page.keyboard.down("Alt");
  await drag(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, { x: c.x + c.width / 2, y: c.y + c.height / 2 + 220 });
  await page.keyboard.up("Alt");
  await expect(shapes).toHaveCount(3);

  // Lock one from its menu: it no longer takes the selection; then hide another (⇧⌘H).
  const ids = await shapes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id!));
  const node = (i: number) => page.locator(`.react-flow__node[data-id="${ids[i]}"]`);
  await node(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Travar" }).click();
  await expect(node(1)).toHaveClass(/wp-locked/);
  await node(0).click();
  await page.keyboard.press("ControlOrMeta+Shift+H");
  await expect(node(0)).toBeHidden();

  // The pane menu brings them back.
  await page.mouse.click(at(0.8, 0.75).x, at(0.8, 0.75).y, { button: "right" });
  await page.getByRole("menuitem", { name: /Mostrar ocultos/ }).click();
  await expect(node(0)).toBeVisible();
  await page.mouse.click(at(0.8, 0.75).x, at(0.8, 0.75).y, { button: "right" });
  await page.getByRole("menuitem", { name: /Destravar tudo/ }).click();
  await expect(node(1)).not.toHaveClass(/wp-locked/);

  // An arrow between two shapes, bent by its middle handle.
  await page.keyboard.press("a");
  const s0 = (await node(1).boundingBox())!;
  const s2 = (await node(2).boundingBox())!;
  await drag(page, { x: s0.x + s0.width / 2, y: s0.y + s0.height / 2 }, { x: s2.x + s2.width / 2, y: s2.y + s2.height / 2 });
  const handle = page.locator(".wp-bend-handle");
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  await drag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2 + 90, y: h.y + h.height / 2 - 40 });
  await expect(page.getByRole("radio", { name: "Curvo" }).first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });
});
