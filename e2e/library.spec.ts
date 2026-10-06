import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("library: icons by Portuguese words, and reusable pieces in Minha biblioteca", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);

  await page.getByRole("tab", { name: "Biblioteca" }).click();
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("banco");
  await page.getByRole("button", { name: "Inserir ícone database", exact: true }).click();
  await expect(page.locator(".wp-icon")).toHaveCount(1);

  // The new icon is selected: keep it in the library and use it again.
  await page.getByRole("button", { name: "Adicionar seleção à biblioteca" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Banco de dados");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar" }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Banco de dados" });
  await expect(item).toBeVisible();
  await item.getByRole("button").first().click();
  await expect(page.locator(".wp-icon")).toHaveCount(2);
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  // Brand logos come with their name.
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("postgres");
  await page.getByRole("button", { name: "Inserir ícone PostgreSQL", exact: true }).click();
  await expect(page.locator(".wp-icon").filter({ hasText: "PostgreSQL" })).toBeVisible();
});
