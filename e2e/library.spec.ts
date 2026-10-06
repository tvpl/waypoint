import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("library: icons by Portuguese words, and reusable pieces in Minha biblioteca", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);

  await page.getByRole("tab", { name: "Biblioteca" }).click();
  await page.getByRole("radio", { name: "Ícones" }).click();
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("banco");
  await page.getByRole("button", { name: "Inserir ícone database", exact: true }).click();
  await expect(page.locator(".wp-icon")).toHaveCount(1);

  // The new icon is selected: keep it in the library and use it again.
  await page.getByRole("radio", { name: "Minha" }).click();
  await page.getByRole("button", { name: "Adicionar seleção à biblioteca" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Banco de dados");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar" }).click();
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("");
  const item = page.getByRole("listitem").filter({ hasText: "Banco de dados" });
  await expect(item).toBeVisible();
  await item.getByRole("button").first().click();
  await expect(page.locator(".wp-icon")).toHaveCount(2);
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });

  // Brand logos come with their name.
  await page.getByRole("radio", { name: "Marcas" }).click();
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("postgres");
  await page.getByRole("button", { name: "Inserir ícone PostgreSQL", exact: true }).click();
  await expect(page.locator(".wp-icon").filter({ hasText: "PostgreSQL" })).toBeVisible();
});

test("kits: configurable components from the library and the quick insert", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);

  // A Kafka topic from the kits, then three more partitions in its properties.
  await page.getByRole("tab", { name: "Biblioteca" }).click();
  await page.getByRole("searchbox", { name: "Buscar ícones e itens da biblioteca" }).fill("kafka");
  await page.getByRole("button", { name: "Inserir Tópico Kafka" }).click();
  const topic = page.locator(".react-flow__node-component");
  await expect(topic).toHaveCount(1);
  await expect(topic.getByText("P2")).toBeVisible();
  await page.locator("#cf-" + (await topic.getAttribute("data-id")) + "-partitions").fill("6");
  await expect(topic.getByText("P5")).toBeVisible();

  // "/" opens the quick insert where the pointer is.
  await page.locator(".react-flow__pane").click({ position: { x: 600, y: 420 } });
  await page.keyboard.press("/");
  await page.getByRole("textbox", { name: "O que inserir" }).fill("tabela");
  await page.keyboard.press("Enter");
  await expect(page.locator(".react-flow__node-component")).toHaveCount(2);
  await expect(page.locator(".react-flow__node-component", { hasText: "cliente_id" })).toBeVisible();
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });
});
