import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("annotations: a pin on an element, the legend, hiding them all", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  const block = page.locator(".react-flow__node-block");
  const b = (await block.boundingBox())!;

  // N, a category, click on the block: a numbered pin attached to it.
  await page.keyboard.press("n");
  await page.getByRole("toolbar", { name: "Anotar" }).getByRole("radio", { name: "Risco" }).click();
  await page.mouse.click(b.x + b.width - 8, b.y + 8);
  await page.keyboard.type("Sem limite de taxa");
  await page.keyboard.press("Enter");
  const pin = page.locator(".react-flow__node-annotation");
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText("1");

  // It moves with the block.
  await page.keyboard.press("Escape");
  const before = (await pin.boundingBox())!;
  await page.mouse.move(b.x + 40, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + b.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  const after = (await pin.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBeGreaterThan(60);

  // The legend lists it; ⇧N hides every annotation.
  await page.getByRole("button", { name: "Anotações" }).click();
  await expect(page.getByRole("dialog").getByText("Sem limite de taxa")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.mouse.click(b.x + 400, b.y + 300);
  await page.keyboard.press("Shift+N");
  await expect(pin).toBeHidden();
  await expect(page.getByText("Salvo")).toBeVisible({ timeout: 15_000 });
});
