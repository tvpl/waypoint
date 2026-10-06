import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Screenshot comparisons of the canvas and the properties panel, light and dark. Baselines live in
 * e2e/visual.spec.ts-snapshots (Linux); after an intended visual change, refresh them with
 * `npx playwright test e2e/visual.spec.ts --update-snapshots`.
 */

async function put(page: Page, what: string, fx: number, fy: number) {
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.dblclick(pane.x + pane.width * fx, pane.y + pane.height * fy);
  await page.getByRole("textbox", { name: "O que inserir" }).fill(what);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.mouse.click(pane.x + 6, pane.y + pane.height - 6);
}

async function theme(page: Page, dark: boolean) {
  await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
  // Let transitions settle.
  await page.waitForTimeout(400);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("visual: canvas and properties, light and dark", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("wp-motion", "reduce");
      localStorage.setItem("wp-planner-left-collapsed", "1");
    } catch {}
  });
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  await page.locator(".react-flow__pane").waitFor();

  await put(page, "Bloco", 0.18, 0.25);
  await put(page, "Nota", 0.18, 0.62);
  await put(page, "Tópico Kafka", 0.5, 0.25);
  await put(page, "Tabela", 0.78, 0.4);
  await put(page, "Cilindro", 0.5, 0.65);
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  const canvas = page.locator('[data-planner-region="canvas"]');
  // The dock and zoom buttons are part of the look; the minimap and toasts are not.
  const mask = [page.locator(".react-flow__minimap"), page.locator("[data-sonner-toaster]")];
  await theme(page, false);
  await expect(canvas).toHaveScreenshot("canvas-light.png", { mask, maxDiffPixelRatio: 0.01 });
  await theme(page, true);
  await expect(canvas).toHaveScreenshot("canvas-dark.png", { mask, maxDiffPixelRatio: 0.01 });

  // Properties of the cylinder.
  await theme(page, false);
  await page.locator(".react-flow__node-shape").first().click();
  const props = page.locator('[aria-label="Propriedades"]:not(button)').first();
  await expect(props).toBeVisible();
  await expect(props).toHaveScreenshot("properties-light.png", { maxDiffPixelRatio: 0.01 });
  await theme(page, true);
  await expect(props).toHaveScreenshot("properties-dark.png", { maxDiffPixelRatio: 0.01 });
});
