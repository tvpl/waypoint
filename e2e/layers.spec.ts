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

test("layer templates, shapes and text, and comparing views", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo plan" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const editUrl = page.url();

  // Two blocks on the base and a connection between them.
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node-block")).toHaveCount(2);

  // A template adds layers and views; its first layer becomes the active one.
  await page.getByRole("button", { name: "Modelos de camadas" }).first().click();
  await page.getByRole("menuitem", { name: /Atual, proposta e riscos/ }).click();
  await expect(page.getByRole("button", { name: "Ocultar Riscos" })).toBeVisible();

  // A rectangle and a text annotation on "Proposta".
  await page.keyboard.press("p");
  await page.getByRole("radio", { name: "Retângulo" }).click();
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const x = pane.x + pane.width * 0.25;
  const y = pane.y + pane.height * 0.7;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 180, y + 80, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("radio", { name: /Texto à mão/ }).click();
  await page.mouse.click(x, y - 40);
  await expect(page.locator(".react-flow__node-ink input")).toBeFocused();
  await page.keyboard.type("Nova fila");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node-ink")).toHaveCount(2);
  await expect(page.locator(".wp-ink-text", { hasText: "Nova fila" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  // Readers compare "Hoje" with "Com a proposta": the drawings are what changed.
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(/Publicado/).first()).toBeVisible();
  await page.goto(editUrl.replace(/\/edit$/, ""));
  await page.getByRole("button", { name: "Camadas e visões" }).click();
  await page.getByRole("button", { name: "Comparar visões…" }).click();
  const bar = page.getByRole("toolbar", { name: "Comparar visões" });
  await expect(bar).toBeVisible();
  await bar.getByLabel("Depois (B)").selectOption({ label: "Com a proposta" });
  await expect(bar).toContainText("+2");
  await expect(page.locator(".react-flow__node.wp-diff-added")).toHaveCount(2);
  await bar.getByRole("radio", { name: "A", exact: true }).click();
  await expect(page.locator(".react-flow__node-ink")).toHaveCount(0);
});
