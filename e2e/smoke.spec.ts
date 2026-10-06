import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

test("anonymous visitors are sent to login", async ({ page }) => {
  await page.goto("/links");
  await expect(page).toHaveURL(/\/login\?next=%2Flinks/);
  const res = await page.request.get("/api/search?q=x");
  expect(res.status()).toBe(401);
});

test("plan: create, edit, autosave, publish, view", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  // starting-point picker: blank is preselected
  await expect(page.getByRole("radio", { name: /Em branco/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Criar plan" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const editUrl = page.url();

  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  const block = page.locator(".react-flow__node-block").first();
  await expect(block).toBeVisible();
  await block.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Serviço de pagamentos");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator(".react-flow__node-block").getByText("Serviço de pagamentos")).toBeVisible();

  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(/Publicado/).first()).toBeVisible();

  await page.goto(editUrl.replace(/\/edit$/, ""));
  await expect(page.locator(".react-flow__node").getByText("Serviço de pagamentos")).toBeVisible();
  // view mode never shows editing tools
  await expect(page.getByRole("button", { name: /^Bloco/ })).toHaveCount(0);
});

test("links: add a link, find it with global search", async ({ page }) => {
  await signUp(page);
  await page.goto("/links?add=1");
  const dialog = page.getByRole("dialog");
  await dialog.locator("#link-url").fill("https://example.com/waypoint-e2e");
  await dialog.locator("#link-title").fill("Referência E2E Waypoint");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("Referência E2E Waypoint").first()).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/Buscar plans/).fill("Referência E2E");
  await expect(page.getByRole("option", { name: /Referência E2E Waypoint/ })).toBeVisible();
});
