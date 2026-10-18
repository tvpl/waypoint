import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

async function addBatch(page: Page, text: string) {
  await page
    .getByRole("button", { name: "Adicionar vários links", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Adicionar vários links" });
  await dialog.getByLabel("Endereços").fill(text);
  await dialog.getByRole("button", { name: "Revisar links" }).click();
  await expect(
    dialog.getByRole("button", { name: "Salvar novos links" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Salvar novos links" }).click();
  await expect(dialog).toHaveCount(0);
}

test("batch review, shared context actions, editable details and remembered display", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signUp(page);
  await page.goto("/links");
  await addBatch(
    page,
    "https://alpha.example/docs\nhttps://beta.example/guide\nhttp://www.alpha.example/docs/?utm_source=test",
  );
  await expect(page.locator("[data-link-primary]")).toHaveCount(2);

  await page.locator("[data-link-primary]").first().click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Editar detalhes" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Editar detalhes" }).click();
  const detail = page.getByRole("dialog");
  await detail
    .getByLabel("Título", { exact: true })
    .fill("Referência organizada");
  await detail
    .getByLabel("Notas", { exact: true })
    .fill("Material para a próxima revisão.");
  await detail
    .getByRole("button", { name: "Salvar detalhes", exact: true })
    .click();
  await expect(
    page.locator("[data-link-primary]", { hasText: "Referência organizada" }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(detail).toHaveCount(0);

  await page.getByRole("radio", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("table", { name: "Links" })).toBeVisible();
  await page.getByRole("button", { name: "Visualização", exact: true }).click();
  await page.getByLabel("Agrupar por").selectOption("domain");
  await page.getByLabel("Densa", { exact: true }).check();
  await page.getByLabel("Domínio", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: /alpha.example/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Domínio/ }).first(),
  ).toBeVisible();
  const resize = page.getByRole("button", { name: "Ajustar largura de Título", exact: true }).first();
  const oldWidth = await resize.evaluate(el => el.parentElement!.getBoundingClientRect().width);
  await resize.focus();
  await resize.press("ArrowRight");
  await expect.poll(() => resize.evaluate(el => el.parentElement!.getBoundingClientRect().width)).toBeGreaterThan(oldWidth);
  await page.waitForTimeout(250); // Debounced preference persistence.
  await page.reload();
  await expect(
    page.getByRole("table", { name: "Links" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /alpha.example/ }),
  ).toBeVisible();

  await page.locator("[data-link-primary]").first().focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator("[data-link-primary]").first().click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: /^Mover 2 links/ }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Organizar tags de 2 links", exact: true })
    .click();
  const tagDialog = page.getByRole("dialog", {
    name: "Organizar tags de 2 links",
  });
  await tagDialog.getByLabel("Adicionar a todos").fill("pesquisa");
  await tagDialog.getByText("Adicionar a todos", { exact: true }).click();
  await tagDialog.getByRole("button", { name: "Aplicar tags" }).click();
  await expect(tagDialog).toHaveCount(0);
  await expect(
    page
      .getByRole("table")
      .getByRole("button", { name: "#pesquisa", exact: true }),
  ).toHaveCount(2);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.screenshot({ path: test.info().outputPath("waypoint-links-list-light.png") });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: test.info().outputPath("waypoint-links-list-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("waypoint-links-mobile.png") });
  expect(errors).toEqual([]);
});

test("duplicate review preserves existing links and empty-space menu accepts multiple URLs", async ({
  page,
}) => {
  const enrichmentIds: string[][] = [];
  await page.route("**/api/links/enrich", async route => { const data = route.request().postDataJSON(); enrichmentIds.push(data.ids); await route.fulfill({ json: { processed: data.ids.length, enriched: 0, remaining: 0 } }); });
  await signUp(page);
  await page.goto("/links");
  await addBatch(page, "https://alpha.example/docs");
  await page
    .getByRole("main")
    .click({ button: "right", position: { x: 400, y: 650 } });
  await page
    .getByRole("menuitem", { name: "Adicionar vários links", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Adicionar vários links" });
  await dialog
    .getByLabel("Endereços")
    .fill(
      "http://www.alpha.example/docs/?utm_source=test\nhttps://gamma.example/new",
    );
  await dialog.getByRole("button", { name: "Revisar links" }).click();
  await expect(dialog.getByText("1 novos · 1 já salvos")).toBeVisible();
  await dialog.getByLabel("Buscar títulos, ícones e capas em segundo plano").check();
  await dialog.getByRole("button", { name: "Salvar novos links" }).click();
  await expect(page.locator("[data-link-primary]")).toHaveCount(2);
  await expect.poll(() => enrichmentIds.length).toBe(1);
  const addedId = await page.locator("[data-link-primary]", { hasText: "gamma.example" }).getAttribute("data-link-primary");
  expect(enrichmentIds.flat()).toEqual([addedId]);
  await page.reload();
  await expect(page.locator("[data-link-primary]")).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath("waypoint-links-cards.png") });
});


test("collections can move through the same context menu used by their action button", async ({ page }) => {
  await signUp(page);
  for (const name of ["Documentação", "Referências"]) {
    await page.goto("/links?newCollection=1");
    const dialog = page.getByRole("dialog", { name: "Nova coleção", exact: true });
    await dialog.getByLabel("Nome", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "Criar coleção", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole("treeitem", { name: /Documentação/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mover para…", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Mover coleção “Documentação”" });
  await move.getByRole("option", { name: /Referências/ }).click();
  await expect(move).toHaveCount(0);
  await page.reload();
  const expand = page.getByRole("button", { name: "Expandir Referências", exact: true });
  if (await expand.count()) await expand.click();
  const parent = page.getByRole("treeitem", { name: /Referências/ }).first();
  await expect(parent.getByRole("treeitem", { name: /Documentação/ })).toBeVisible();
});
