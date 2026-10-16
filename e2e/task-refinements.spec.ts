import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("templates, advisory capacity, linked tasks and personal follow-up views", async ({
  page,
}) => {
  await signUp(page, "Ana Silva");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Cliente Atlas");
  await page.getByRole("button", { name: "Céu", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("button", { name: "Cliente Atlas", exact: true })
    .click();
  await page.getByRole("button", { name: "Organizar bloco Demandas" }).click();
  await page.getByLabel("Nome do bloco").fill("Entrega");
  await page.getByLabel("Nome da coluna 2", { exact: true }).fill("Criação");
  await page.getByLabel("Limite da coluna 2", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Salvar bloco", exact: true }).click();
  const lane = page.getByRole("region", { name: "Criação", exact: true });
  await lane
    .getByRole("button", { name: "Adicionar em Criação", exact: true })
    .click();
  await page
    .getByLabel("Nome da tarefa rápida")
    .fill("Revisar interface #design @Ana @Marina !alta");
  await page.getByLabel("Nome da tarefa rápida").press("Enter");
  const card = page.getByRole("article", {
    name: "Tarefa: Revisar interface",
    exact: true,
  });
  await expect(card).toBeVisible();
  await page.getByLabel("Nome da tarefa rápida").fill("Preparar arte");
  await page.getByLabel("Nome da tarefa rápida").press("Enter");
  await expect(lane.getByRole("article")).toHaveCount(2);
  await expect(lane).toHaveAttribute("data-over-limit", "true");
  await expect(
    lane.getByLabel("Capacidade de Criação: 2 de 1, acima do limite"),
  ).toBeVisible();
  await page.getByLabel("Nome da tarefa rápida").press("Escape");
  await page.getByRole("button", { name: "Novo bloco", exact: true }).click();
  await page.getByLabel("Nome do bloco").fill("Retornos");
  for (const i of [4, 3, 2])
    await page
      .getByRole("button", { name: `Remover coluna ${i}`, exact: true })
      .click();
  await page
    .getByLabel("Nome da coluna 1", { exact: true })
    .fill("Com o cliente");
  await page
    .getByLabel("Etapa da coluna 1", { exact: true })
    .selectOption("waiting");
  await page.getByRole("button", { name: "Salvar bloco", exact: true }).click();
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page
    .getByRole("menuitem", { name: "Salvar como modelo", exact: true })
    .click();
  await page.getByLabel("Nome do modelo").fill("Entrega de design");
  await page
    .getByRole("button", { name: "Salvar modelo", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Segundo cliente");
  await page
    .getByLabel("Modelo de organização")
    .selectOption({ label: "Entrega de design" });
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByRole("button", { name: "Segundo cliente", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Bloco Retornos", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Criação", exact: true })
      .getByLabel("Capacidade de Criação: 0 de 1"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cliente Atlas", exact: true })
    .click();
  const dependencyId = await page
    .getByRole("article", { name: "Tarefa: Preparar arte", exact: true })
    .getAttribute("data-task-id");
  await card
    .getByRole("button", { name: "Revisar interface", exact: true })
    .click();
  await page.getByLabel("Data ou meta").fill("2028-10-20");
  await page.getByLabel("Nova subtarefa").fill("Conferir contraste");
  await page
    .getByRole("button", { name: "Adicionar subtarefa", exact: true })
    .click();
  await page.getByText("Pendências e dependências", { exact: true }).click();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.getByLabel("Acompanhar em", { exact: true }).fill(today);
  await page.getByLabel("Adicionar dependência").selectOption(dependencyId!);
  await page.getByLabel("Tipo de pendência").selectOption("waiting");
  await page
    .getByLabel("O que falta ou está bloqueando?")
    .fill("Aguardar retorno sobre a direção visual.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    card.getByRole("button", {
      name: `Acompanhar Revisar interface em ${today}`,
    }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Dependências de Revisar interface" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Preparar arte", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  for (const width of [390, 736, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await card.evaluate((el) => ({
      fits: el.scrollWidth <= el.clientWidth + 1,
      height: el.getBoundingClientRect().height,
    }));
    expect(geometry.fits, `Metadados precisam caber em ${width}px`).toBe(true);
    expect(geometry.height).toBeLessThan(140);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Visão de tarefas").selectOption("followup");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    lane.getByLabel("Capacidade de Criação: 2 de 1, acima do limite"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar visão", exact: true }).click();
  await page.getByLabel("Nome da visão").fill("Cobrar retornos");
  await page.getByLabel("Nome da visão").press("Enter");
  await page.reload();
  await page
    .getByRole("button", { name: "Cliente Atlas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cobrar retornos", exact: true })
    .click();
  await expect(page.getByLabel("Visão de tarefas")).toHaveValue("followup");
  await expect(page.getByRole("article")).toHaveCount(1);
  await card
    .getByRole("button", { name: "Dependências de Revisar interface" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Preparar arte", exact: true })
    .click();
  await expect(page.getByText("Desbloqueia", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Revisar interface", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.screenshot({
    path: "test-results/task-refinements-light.png",
    animations: "disabled",
  });
});

test("Markdown preview applies selected updates to the same records and explains conflicts", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page
    .getByRole("menuitem", { name: "Importar Markdown", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Conteúdo Markdown" })
    .fill("- [ ] Primeira entrega\n- [ ] Segunda entrega");
  await page
    .getByRole("button", { name: "Importar 2 tarefas", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
  const originalIds = await page
    .getByRole("article")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-task-id")));
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page
    .getByRole("menuitem", { name: "Exportar visão em Markdown" })
    .click();
  const text = await page
    .getByRole("textbox", { name: "Conteúdo Markdown" })
    .inputValue();
  expect(text).toContain('"ref":');
  await page
    .getByRole("button", { name: "Fechar", exact: true })
    .last()
    .click();
  const edited = text
    .replace(
      "Primeira entrega",
      "Primeira entrega revisada\n  - [ ] Validar o resultado",
    )
    .replace("Segunda entrega", "Segunda entrega revisada");
  const openUpdate = async () => {
    await page.getByRole("button", { name: "Opções de tarefas" }).click();
    await page
      .getByRole("menuitem", { name: "Atualizar via Markdown", exact: true })
      .click();
    await page.getByLabel("Markdown para atualização").fill(edited);
    await page
      .getByRole("button", { name: "Revisar alterações", exact: true })
      .click();
  };
  await openUpdate();
  await expect(
    page.getByText("2 com alterações · 0 sem alterações · 0 para revisar", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Aplicar alterações de Segunda entrega revisada")
    .uncheck();
  await page.getByText("2 campos alterados", { exact: true }).first().click();
  await expect(page.getByText("Antes", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Depois", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "test-results/task-markdown-preview.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Aplicar 1 atualização", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    page.getByRole("article", {
      name: "Tarefa: Primeira entrega revisada",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Tarefa: Segunda entrega", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("article")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("data-task-id"))),
  ).toEqual(originalIds);
  await expect(
    page.getByRole("article", {
      name: "Tarefa: Primeira entrega revisada",
      exact: true,
    }),
  ).toContainText("0/1");
  await openUpdate();
  await expect(
    page.getByText("Esta tarefa mudou desde a exportação.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aplicar 1 atualização", exact: true })
    .click();
  await expect(
    page.getByRole("article", {
      name: "Tarefa: Segunda entrega revisada",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(2);
});
