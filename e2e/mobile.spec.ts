import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("phones get a bottom tab bar instead of the rail", async ({ page }) => {
  await signUp(page);
  const bar = page.getByRole("navigation", { name: "Navegação principal" }).filter({ hasText: "Buscar" });
  await expect(bar).toBeVisible();
  await bar.getByRole("link", { name: "Links" }).click();
  await expect(page).toHaveURL(/\/links/);
});
