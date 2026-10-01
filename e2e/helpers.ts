import { expect, type Page } from "@playwright/test";

/** Signs up a fresh user so every run starts from an empty workspace. */
export async function signUp(page: Page, name = "Teste E2E") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@waypoint.test`;
  await page.goto("/signup");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL("/");
  return { email };
}
