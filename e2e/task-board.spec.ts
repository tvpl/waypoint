import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("compact boards: project columns, smart capture, saved views, display preferences and moving across blocks", async ({
  page,
}) => {
  await signUp(page, "Ana Silva");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Produto");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Produto", exact: true }).click();
  await page.getByRole("button", { name: "Organizar bloco Demandas" }).click();
  await page.getByLabel("Nome do bloco").fill("Entrega do produto");
  await page
    .getByLabel("Nome da coluna 2", { exact: true })
    .fill("Em produção");
  await page
    .getByRole("button", { name: "Adicionar coluna", exact: true })
    .click();
  await page
    .getByLabel("Nome da coluna 5", { exact: true })
    .fill("Validação final");
  await page
    .getByLabel("Etapa da coluna 5", { exact: true })
    .selectOption("waiting");
  await page.getByRole("button", { name: "Salvar bloco", exact: true }).click();
  const main = page.getByRole("region", {
    name: "Bloco Entrega do produto",
    exact: true,
  });
  await expect(main.locator("[data-column-id]")).toHaveCount(5);
  await main
    .getByRole("button", { name: "Adicionar em A fazer", exact: true })
    .click();
  await page
    .getByLabel("Nome da tarefa rápida")
    .fill(
      'Validar proposta #cliente @"Ana Silva" amanhã !alta\n  - [ ] Reunir briefing\n  - [x] Mapear escopo',
    );
  await page.getByLabel("Nome da tarefa rápida").press("Enter");
  const card = page.getByRole("article", {
    name: "Tarefa: Validar proposta",
    exact: true,
  });
  await expect(card).toContainText("#cliente");
  await expect(card).toContainText("1/2");
  await expect(card).toContainText("Alta");
  await expect(
    card.getByRole("button", { name: /^Alterar data:/ }),
  ).toBeVisible();
  await expect(card.getByLabel("Pessoas de apoio: Ana Silva")).toBeVisible();
  await page.getByLabel("Nome da tarefa rápida").press("Escape");
  const size = await card.boundingBox();
  expect(size!.height).toBeLessThan(130);

  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por pessoa").selectOption("Ana Silva");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Salvar visão", exact: true }).click();
  await page.getByLabel("Nome da visão").fill("Com a Ana");
  await page.getByLabel("Nome da visão").press("Enter");
  await page.getByLabel("Buscar tarefas").fill("Não existe");
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Com a Ana", exact: true }).click();
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "3 colunas por linha" }).click();
  await page.getByRole("button", { name: "Personalizar cards" }).click();
  await page.getByLabel("Prioridade", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(card).not.toContainText("Alta");
  await page.reload();
  await page.getByRole("button", { name: "Produto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "3 colunas por linha" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(card).not.toContainText("Alta");
  await expect(
    page.getByRole("button", { name: "Com a Ana", exact: true }),
  ).toBeVisible();
  await expect(main.locator("[data-column-id]")).toHaveCount(5);

  await page.getByRole("button", { name: "Novo bloco", exact: true }).click();
  await page.getByLabel("Nome do bloco").fill("Retornos");
  await page
    .getByLabel("Nome da coluna 1", { exact: true })
    .fill("Com o cliente");
  await page
    .getByLabel("Etapa da coluna 1", { exact: true })
    .selectOption("waiting");
  await page.getByRole("button", { name: "Salvar bloco", exact: true }).click();
  const waiting = page.getByRole("region", {
    name: "Bloco Retornos",
    exact: true,
  });
  const client = waiting.getByRole("region", {
    name: "Com o cliente",
    exact: true,
  });
  await card.dragTo(client);
  await expect(client.getByRole("article")).toHaveCount(1);
  await card
    .getByRole("button", { name: "Validar proposta", exact: true })
    .click();
  await page.getByText("Pendências e dependências", { exact: true }).click();
  await page.getByLabel("Tipo de pendência").selectOption("decision");
  await page
    .getByLabel("O que falta ou está bloqueando?")
    .fill("Cliente precisa escolher a direção visual.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await card
    .getByRole("button", { name: "Ver pendência de Validar proposta" })
    .click();
  await expect(
    page.getByText("Precisa de decisão", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  for (let i = 1; i <= 3; i++) {
    if (i === 1)
      await client
        .getByRole("button", {
          name: "Adicionar em Com o cliente",
          exact: true,
        })
        .click();
    await page.getByLabel("Nome da tarefa rápida").fill(`Retorno extra ${i}`);
    await page.getByLabel("Nome da tarefa rápida").press("Enter");
    await expect(
      client.getByRole("article", {
        name: `Tarefa: Retorno extra ${i}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByLabel("Nome da tarefa rápida").press("Escape");
  await page.getByRole("button", { name: "Personalizar cards" }).click();
  await page.getByLabel("Limite de cards por coluna").selectOption("3");
  await page.keyboard.press("Escape");
  await expect(client.getByRole("article")).toHaveCount(3);
  await client.getByRole("button", { name: "Ver mais 1", exact: true }).click();
  await expect(client.getByRole("article")).toHaveCount(4);
  await client
    .getByRole("button", { name: "Mostrar menos", exact: true })
    .click();
  await expect(client.getByRole("article")).toHaveCount(3);
  await waiting
    .getByRole("button", {
      name: "Exibição da coluna Com o cliente",
      exact: true,
    })
    .click();
  const widthControl = page.getByRole("slider", {
    name: "Largura da coluna Com o cliente",
    exact: true,
  });
  await widthControl.focus();
  await widthControl.press("Home");
  for (let i = 0; i < 12; i++) await widthControl.press("ArrowRight");
  await expect(client).toHaveCSS("flex-basis", "320px");
  await page
    .getByRole("button", { name: "Recolher coluna", exact: true })
    .click();
  await expect(
    waiting.getByRole("button", { name: "Expandir coluna Com o cliente" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Produto", exact: true }).click();
  await expect(
    waiting.getByRole("button", { name: "Expandir coluna Com o cliente" }),
  ).toBeVisible();
  await waiting
    .getByRole("button", { name: "Expandir coluna Com o cliente" })
    .click();
  await expect(client.getByRole("article")).toHaveCount(3);
  await expect(client).toHaveCSS("flex-basis", "320px");
  await page.getByRole("button", { name: "Sem projeto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "4 colunas por linha" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Bloco Retornos" }),
  ).toHaveCount(0);
});
