import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("plan layers: draw on a new layer, hide it, save it, toggle it in view mode", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const editUrl = page.url();

  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await expect(page.locator(".react-flow__node-block")).toHaveCount(1);

  // A second layer becomes the active one; the stroke goes there.
  await page.getByRole("tab", { name: /Camadas/ }).click();
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
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const editUrl = page.url();

  // Two blocks on the base.
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node-block")).toHaveCount(2);

  // A template adds layers and views; its first layer becomes the active one.
  await page.getByRole("tab", { name: /Camadas/ }).click();
  await page.getByRole("button", { name: "Modelos de camadas" }).first().click();
  await page.getByRole("menuitem", { name: /Atual, proposta e riscos/ }).click();
  await expect(page.getByRole("button", { name: "Ocultar Riscos" })).toBeVisible();

  // A rectangle and a text annotation on "Proposta".
  await page.keyboard.press("r");
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const x = pane.x + pane.width * 0.25;
  const y = pane.y + pane.height * 0.7;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 180, y + 80, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("t");
  await page.mouse.click(x, y - 60);
  await expect(page.locator(".react-flow__node-shape textarea")).toBeFocused();
  await page.keyboard.type("Nova fila");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(2);
  await expect(page.locator(".react-flow__node-shape", { hasText: "Nova fila" })).toBeVisible();
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
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(0);
});

test("layers panel: folders, isolating a layer, moving an element by dragging", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /Camadas/ }).click();
  await page.getByRole("button", { name: "Nova camada" }).click();

  // The block (on the base) is dragged from the base's element list onto "Camada 2".
  await page.getByRole("button", { name: "Mostrar elementos de Base" }).click();
  const element = page.getByRole("list", { name: "Elementos de Base" }).getByRole("button").first();
  await element.dragTo(page.locator("li", { hasText: "Camada 2" }).locator("[draggable=true]").first());
  await expect(page.locator("li", { hasText: "Camada 2" }).first()).toContainText("1 elemento");

  // Isolating the base fades the block (now on Camada 2) and keeps it from being selected.
  await page.locator("li", { hasText: /^Base/ }).first().hover();
  await page.getByRole("button", { name: "Mais opções de Base" }).click();
  await page.getByRole("menuitem", { name: /Isolar/ }).click();
  await expect(page.getByText("Editando só")).toBeVisible();
  await expect(page.locator(".react-flow__node-block.wp-isolate-out")).toHaveCount(1);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Editando só")).toBeHidden();

  // A folder groups layers and hides them together.
  await page.locator("li", { hasText: "Camada 2" }).first().hover();
  await page.getByRole("button", { name: "Mais opções de Camada 2" }).click();
  await page.getByRole("menuitem", { name: "Mover para pasta" }).click();
  await page.getByRole("menuitem", { name: "Nova pasta…" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Versões");
  await page.getByRole("dialog").getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Ocultar pasta Versões" }).click();
  await expect(page.locator(".react-flow__node-block")).toBeHidden();
});

test("drawing: shapes, an arrow bound between them, and text", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);

  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: pane.x + pane.width * fx, y: pane.y + pane.height * fy });
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
  };

  // Two boxes: R draws a rectangle, O an ellipse.
  await page.keyboard.press("r");
  await expect(page.getByRole("toolbar", { name: "Estilo do desenho" })).toBeVisible();
  await drag(at(0.2, 0.3), at(0.35, 0.45));
  await page.keyboard.press("o");
  await drag(at(0.6, 0.3), at(0.75, 0.45));
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(2);

  // An arrow from one to the other becomes a connection between them.
  await page.keyboard.press("a");
  await drag(at(0.27, 0.37), at(0.67, 0.37));
  await expect(page.locator(".react-flow__edge.wp-drawn-edge")).toHaveCount(1);

  // Text: click, type, click away.
  await page.keyboard.press("t");
  const t = at(0.4, 0.7);
  await page.mouse.click(t.x, t.y);
  await page.keyboard.type("Revisar");
  const away = at(0.85, 0.8);
  await page.mouse.click(away.x, away.y);
  await expect(page.locator(".react-flow__node-shape").filter({ hasText: "Revisar" })).toHaveCount(1);
});
