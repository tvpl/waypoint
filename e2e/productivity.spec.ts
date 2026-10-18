import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

async function createTask(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que precisa ser feito?").fill(title);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.getByRole("article", { name: `Tarefa: ${title}`, exact: true })).toBeVisible();
}

test("tasks: history with observations, stars, hide rules and the completed report", async ({ page }) => {
  await signUp(page, "Bia Costa");
  await page.goto("/tasks");
  await createTask(page, "Entregar relatório trimestral");
  await createTask(page, "Revisar contrato");

  // Observations and history live in the details panel.
  const card = page.getByRole("article", { name: "Tarefa: Entregar relatório trimestral", exact: true });
  await card.locator(".wp-task-title").click();
  const sheet = page.getByRole("dialog", { name: "Detalhes da tarefa" });
  await expect(sheet.getByText("Observações e histórico")).toBeVisible();
  await expect(sheet.getByText("Criada", { exact: true })).toBeVisible();
  await sheet.getByLabel("Nova observação").fill("Financeiro validou os números.");
  await sheet.getByRole("button", { name: "Registrar" }).click();
  await expect(sheet.getByText("Financeiro validou os números.")).toBeVisible();
  await sheet.getByRole("button", { name: "Marcar como importante" }).click();
  await expect(sheet.getByRole("button", { name: /Importante/ })).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(card.getByLabel("Importante")).toBeVisible();

  // Complete it; then hide completed items of this folder.
  await page.getByRole("button", { name: "Concluir Entregar relatório trimestral" }).click();
  await expect(card).toContainText("Entregar relatório trimestral");
  await page.getByRole("button", { name: "Ocultar itens" }).click();
  await page.getByRole("radio", { name: "Concluído: ocultar todas" }).click();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Concluídas ocultas", exact: true })).toBeVisible();
  // Rules are remembered per folder.
  await page.reload();
  await expect(page.getByRole("article", { name: "Tarefa: Entregar relatório trimestral" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ocultar itens" }).click();
  await page.getByRole("radio", { name: "Concluído: ocultar antes deste mês" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "Tarefa: Entregar relatório trimestral" })).toBeVisible();
  await page.getByRole("button", { name: /^Ocultas: Concluído antes deste mês/ }).click();

  // The report lists what was completed, with the observation and the history.
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page.getByRole("menuitem", { name: "Relatório de concluídas" }).click();
  const report = page.getByRole("dialog", { name: "Relatório de concluídas" });
  await expect(report.getByRole("status")).toHaveText("1 tarefa concluída");
  const preview = report.locator("article");
  await expect(preview).toContainText("Entregar relatório trimestral");
  await expect(preview).toContainText("Financeiro validou os números.");
  await expect(preview).toContainText("Concluída (Bia Costa)");
  await report.getByRole("radio", { name: "Markdown" }).click();
  await expect(report.locator("pre")).toContainText("### ✅ Entregar relatório trimestral");
  const download = page.waitForEvent("download");
  await report.getByRole("button", { name: "Baixar .md" }).click();
  expect((await download).suggestedFilename()).toMatch(/^relatorio-.*-este-mes\.md$/);
});

test("home dashboard: shortcuts, important items, today and layout", async ({ page }) => {
  await signUp(page, "Caio Lima");
  await page.goto("/tasks?new=1");
  await page.getByLabel("O que precisa ser feito?").fill("Ligar para o fornecedor");
  const today = new Date();
  await page.getByLabel("Data ou meta").fill(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await page.getByRole("article", { name: "Tarefa: Ligar para o fornecedor" }).getByRole("button", { name: "Ações de Ligar para o fornecedor" }).click();
  await page.getByRole("menuitem", { name: "Marcar como importante" }).click();
  await expect(page.getByText("Marcada como importante.")).toBeVisible();

  await page.goto("/");
  const shortcuts = page.getByRole("region", { name: "Atalhos" });
  await shortcuts.getByRole("button", { name: "Meu dia" }).click();
  await expect(shortcuts.getByRole("link", { name: "Meu dia" })).toBeVisible();
  await shortcuts.getByRole("button", { name: "Adicionar" }).click();
  const dialog = page.getByRole("dialog", { name: "Novo atalho" });
  await dialog.getByLabel("Nome").fill("Documentação");
  await dialog.getByLabel("Endereço").fill("docs.example.com");
  await dialog.getByRole("button", { name: "Adicionar atalho" }).click();
  await expect(shortcuts.getByRole("link", { name: /Documentação/ })).toHaveAttribute("href", "https://docs.example.com");

  await expect(page.getByRole("region", { name: "Importantes" })).toContainText("Ligar para o fornecedor");
  await expect(page.getByRole("region", { name: "Para hoje" })).toContainText("Ligar para o fornecedor");

  // Hide a section, reload, it stays hidden.
  await page.getByRole("button", { name: "Personalizar" }).click();
  await page.getByRole("button", { name: "Ocultar Para hoje" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Para hoje" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Para hoje" })).toHaveCount(0);

  await shortcuts.getByRole("link", { name: "Meu dia" }).click();
  await expect(page.getByRole("heading", { name: "Meu dia" })).toBeVisible();
});

test("settings tabs, backups and the guided tour", async ({ page }) => {
  await signUp(page, "Duda Reis");
  await page.goto("/settings");
  await expect(page.getByRole("tab", { name: "Conta" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Backup e dados" }).click();
  await expect(page).toHaveURL(/tab=backup/);
  await page.getByRole("button", { name: "Criar backup agora" }).click();
  await page.getByRole("button", { name: "Criar backup", exact: true }).click();
  await expect(page.getByText("Backup criado.")).toBeVisible();
  await expect(page.locator("[data-tour=settings-backup-list]")).toContainText("Backup manual");
  await page.getByRole("button", { name: "Recuperar itens" }).first().click();
  await expect(page.getByText("Nada a recuperar")).toBeVisible();
  await page.keyboard.press("Escape");
  // Old anchors still land on the right tab.
  await page.goto("/settings#api-tokens");
  await expect(page.getByRole("tab", { name: "Integrações" })).toHaveAttribute("aria-selected", "true");

  await page.goto("/help");
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Tarefas", exact: true }) })
    .getByRole("button", { name: /Fazer o tour/ })
    .click();
  await expect(page).toHaveURL(/\/tasks/);
  const tour = page.locator("[role=dialog][aria-labelledby=wp-tour-title]");
  await expect(tour).toContainText("1 de");
  await page.getByRole("button", { name: /Próximo/ }).click();
  await expect(tour).toContainText("2 de");
  await page.keyboard.press("Escape");
  await expect(page.locator("[aria-labelledby=wp-tour-title]")).toHaveCount(0);
  await page.goto("/help/tarefas");
  await expect(page.getByRole("heading", { name: "Passo a passo" })).toBeVisible();
});
