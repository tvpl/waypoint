import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("personal reminders: project batch, native options, snooze, persistence and automatic cancellation", async ({
  page,
}) => {
  await signUp(page, "Ana Lembretes");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Lançamento");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const title of ["Preparar lançamento", "Revisar proposta"]) {
    await page
      .getByRole("button", { name: "Nova tarefa", exact: true })
      .click();
    await page.getByLabel("O que precisa ser feito?").fill(title);
    await page
      .getByLabel("Projeto", { exact: true })
      .selectOption({ label: "Lançamento" });
    await page
      .getByRole("button", { name: "Criar tarefa", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Meus lembretes", exact: true })
    .click();
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await page
    .getByLabel("Aplicar em", { exact: true })
    .selectOption({ label: "Lançamento" });
  await page.getByRole("button", { name: "Iniciar até", exact: true }).click();
  await page.getByLabel("Dia", { exact: true }).fill("2028-10-20");
  await page.getByLabel("Horário limite", { exact: true }).fill("10:30");
  await page.getByLabel("Avisar", { exact: true }).selectOption("15");
  await page.getByLabel("Entrega", { exact: true }).selectOption("silent");
  await page.getByLabel("Adiar pelo aviso do Mac").selectOption("30");
  await expect(
    page.getByText("2 tarefas receberão este lembrete.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/private/tmp/waypoint-reminder-compose.png" });
  await page
    .getByRole("button", { name: "Agendar 2 lembretes", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Meus lembretes", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Lista de lembretes")
      .getByRole("button", { name: "Preparar lançamento", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Adiar lembrete de Preparar lançamento",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await expect(page.getByText(/Adiado para/)).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Meus lembretes", exact: true })
    .click();
  await expect(page.getByText(/Adiado para/)).toBeVisible();
  await page
    .getByRole("button", { name: "Selecionar lembretes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Selecionar todos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adiar lembrete de seleção", exact: true })
    .click();
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await expect(page.getByText(/Adiado para/)).toHaveCount(2);
  await page.screenshot({ path: "/private/tmp/waypoint-reminder-inbox.png" });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("article", { name: "Tarefa: Preparar lançamento", exact: true })
    .getByRole("button", { name: "Preparar lançamento", exact: true })
    .click();
  await page.getByLabel("Etapa", { exact: true }).selectOption("doing");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Meus lembretes", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Lista de lembretes")
      .getByRole("button", { name: "Preparar lançamento", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Lista de lembretes")
      .getByRole("button", { name: "Revisar proposta", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Dispensar lembrete de Revisar proposta",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Espaço para seus próximos passos", { exact: true }),
  ).toBeVisible();
});

test("card context and details offer day-only reminders without losing an editing draft", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que precisa ser feito?").fill("Enviar retorno");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const card = page.getByRole("article", {
    name: "Tarefa: Enviar retorno",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Lembretes", exact: true }).click();
  await page.getByLabel("Dia", { exact: true }).fill("2028-10-21");
  await page
    .getByLabel("Definir só o dia, sem horário limite", { exact: true })
    .check();
  await page.getByLabel("Horário do aviso", { exact: true }).fill("09:00");
  await page.getByLabel("Entrega", { exact: true }).selectOption("inbox");
  await page
    .getByRole("button", { name: "Agendar lembrete", exact: true })
    .click();
  await expect(
    page.getByText("Somente na central", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await card
    .getByRole("button", { name: "Enviar retorno", exact: true })
    .click();
  await page.getByLabel("Contexto · Markdown").fill("Rascunho preservado");
  await page.getByRole("button", { name: /Lembretes pessoais/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Meus lembretes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Meus lembretes", exact: true })
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await expect(page.getByLabel("Contexto · Markdown")).toHaveValue(
    "Rascunho preservado",
  );
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
});
