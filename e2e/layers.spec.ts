import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("plan layers: draw on a new layer, hide it, save it, toggle it in view mode", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo plan" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const editUrl = page.url();

  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await expect(page.locator(".react-flow__node-block")).toHaveCount(1);

  // A second layer becomes the active one; the stroke goes there.
  await page.getByRole("button", { name: "Nova camada" }).click();
  await page.keyboard.press("p");
  await expect(page.getByRole("toolbar", { name: "Desenho" })).toBeVisible();
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const x = pane.x + pane.width * 0.3;
  const y = pane.y + pane.height * 0.7;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y - 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__node-ink")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Hiding the layer hides the drawing, not the block on the base layer.
  await page.getByRole("button", { name: "Ocultar Camada 2" }).click();
  await expect(page.locator(".react-flow__node-ink")).toBeHidden();
  await expect(page.locator(".react-flow__node-block")).toBeVisible();
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  // Saved with the plan.
  await page.reload();
  await expect(page.getByRole("button", { name: "Mostrar Camada 2" })).toBeVisible();
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(/Publicado/).first()).toBeVisible();

  // Readers switch layers for themselves.
  await page.goto(editUrl.replace(/\/edit$/, ""));
  await expect(page.locator(".react-flow__node-ink")).toBeHidden();
  await page.getByRole("button", { name: "Camadas e visões" }).click();
  await page.getByRole("button", { name: /Camada 2/ }).click();
  await expect(page.locator(".react-flow__node-ink")).toBeVisible();
});
