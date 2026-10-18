import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("keyboard: F6 moves between the editor's areas; reduced motion from the settings", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "Novo diagrama em branco" }).click();
  await expect(page).toHaveURL(/\/plans\/\w+\/edit$/);
  await page.getByRole("button", { name: /^Bloco/ }).first().click();
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });

  // Which area holds the focus.
  const area = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (a?.closest("header")) return "header";
      if (a?.closest('aside[aria-label="Ferramentas"]')) return "tools";
      if (a?.closest('[role="toolbar"][aria-label="Ferramentas do canvas"]')) return "dock";
      if (a?.closest('[aria-label="Propriedades"]')) return "props";
      if (a?.closest('[data-planner-region="canvas"]')) return "canvas";
      return "other";
    });
  const seen: string[] = [];
  // Nothing selected: no properties panel.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("F6");
    seen.push(await area());
  }
  expect(new Set(seen)).toEqual(new Set(["header", "tools", "canvas", "dock"]));
  // ⇧F6 goes back.
  await page.keyboard.press("Shift+F6");
  expect(await area()).toBe(seen[2]);

  await page.goto("/settings?tab=aparencia");
  await page.getByRole("radio", { name: "Reduzir animações" }).click();
  await expect(page.locator("html")).toHaveClass(/wp-reduce-motion/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/wp-reduce-motion/);
  await page.getByRole("radio", { name: "Como no sistema" }).click();
  await expect(page.locator("html")).not.toHaveClass(/wp-reduce-motion/);
});
