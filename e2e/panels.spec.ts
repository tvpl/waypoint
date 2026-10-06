import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("panels: properties float with the selection, fold, pin; quick bar and convert", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  const props = page.getByRole("complementary", { name: "Propriedades" });

  // Nothing selected: no properties taking space.
  await expect(props).toHaveCount(0);
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await expect(props).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__node-block").click();
  await expect(page.getByRole("toolbar", { name: "Seleção" })).toBeVisible();

  // Fold with I; a small button brings it back.
  await page.keyboard.press("i");
  await expect(props).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar propriedades" }).click();
  await expect(props).toBeVisible();

  // Pinned, it stays (with the plan's details) when nothing is selected.
  await page.getByRole("button", { name: "Fixar as propriedades" }).click();
  await page.keyboard.press("Escape");
  await expect(props).toBeVisible();
  await page.getByRole("button", { name: "Soltar as propriedades" }).click();

  // Convert the block into an ellipse from the context menu.
  await page.locator(".react-flow__node-block").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Converter em" }).click();
  await page.getByRole("menuitem", { name: "Elipse" }).click();
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(1);
  await expect(page.locator(".react-flow__node-block")).toHaveCount(0);

  // The left panel folds to icons and opens as a drawer.
  await page.getByRole("button", { name: "Recolher o painel" }).click();
  await page.getByRole("button", { name: "Camadas" }).click();
  await expect(page.getByRole("dialog", { name: "Camadas" })).toBeVisible();
  await page.getByRole("button", { name: "Fixar o painel lateral" }).click();
  await expect(page.getByRole("tab", { name: "Camadas" })).toBeVisible();
});
