import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("tasks: projects, optional details, filters, drag, context actions, Markdown and persistence", async ({
  page,
}) => {
  await signUp(page, "Ana Silva");
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Todas as tarefas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.getByLabel("Nome do projeto").fill("Redesign do site");
  await page.getByRole("button", { name: "Menta", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que precisa ser feito?")
    .fill("Preparar proposta de redesign");
  await page
    .getByLabel("Projeto", { exact: true })
    .selectOption({ label: "Redesign do site" });
  await page.getByLabel("Data ou meta").fill("2026-10-20");
  await page
    .getByLabel("Contexto · Markdown")
    .fill(
      "## Objetivo\n**Organizar** a entrega com clareza.\n[Referência](https://example.com)",
    );
  await page.getByLabel("Nova subtarefa").fill("Reunir briefing");
  await page
    .getByRole("button", { name: "Adicionar subtarefa", exact: true })
    .click();
  await page.getByLabel("Nova subtarefa").fill("Alinhar escopo");
  await page
    .getByRole("button", { name: "Adicionar subtarefa", exact: true })
    .click();
  await page.getByText("Pendências e dependências", { exact: true }).click();
  await page
    .getByLabel("O que falta ou está bloqueando?")
    .fill("Aguardando orçamento da equipe.");
  await page.getByText("Pessoas e organização", { exact: true }).click();
  await page.getByLabel("Pessoas de apoio", { exact: true }).fill("Ana Silva");
  await page
    .getByRole("button", { name: "Adicionar pessoas de apoio" })
    .click();
  await page.getByLabel("Marcadores", { exact: true }).fill("cliente");
  await page.getByRole("button", { name: "Adicionar marcadores" }).click();
  await page.getByLabel("Prioridade", { exact: true }).selectOption("high");
  await page.getByRole("button", { name: "Lavanda", exact: true }).click();
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const card = page.getByRole("article", {
    name: "Tarefa: Preparar proposta de redesign",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-color", "lavender");
  await expect(card).toContainText("0/2");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por pessoa").selectOption("Ana Silva");
  await page.keyboard.press("Escape");
  await expect(card).toBeVisible();
  await page.getByLabel("Buscar tarefas").fill("inexistente");
  await expect(
    page.getByText("Nenhuma tarefa combina", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(card).toBeVisible();
  await card.dragTo(
    page.getByRole("region", { name: "Em andamento", exact: true }),
  );
  await expect(
    page
      .getByRole("region", { name: "Em andamento", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Cor do card" }).hover();
  await page.getByRole("menuitem", { name: "Pêssego", exact: true }).click();
  await expect(card).toHaveAttribute("data-color", "peach");
  await card
    .getByRole("button", { name: "Preparar proposta de redesign", exact: true })
    .click();
  await page.getByLabel("Concluir Reunir briefing", { exact: true }).check();
  await page.getByRole("button", { name: "Visualizar", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Referência", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(card).toContainText("1/2");
  await page.reload();
  await expect(card).toContainText("1/2");
  await expect(
    page
      .getByRole("region", { name: "Em andamento", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(card).toContainText("Em andamento");
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page
    .getByRole("menuitem", { name: "Exportar visão em Markdown" })
    .click();
  const markdown = await page
    .getByRole("textbox", { name: "Conteúdo Markdown" })
    .inputValue();
  expect(markdown).toContain('"people":["Ana Silva"]');
  expect(markdown).toContain("- [x] Reunir briefing");
  expect(markdown).toContain("Preparar proposta de redesign");
  await page
    .getByRole("button", { name: "Fechar", exact: true })
    .last()
    .click();
  await card
    .getByRole("button", {
      name: "Concluir Preparar proposta de redesign",
      exact: true,
    })
    .click();
  await expect(
    card.getByRole("button", {
      name: "Reabrir Preparar proposta de redesign",
      exact: true,
    }),
  ).toBeVisible();
  await card.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Arquivar tarefa", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Visão de tarefas").selectOption("archived");
  await expect(card).toBeVisible();
  await card.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Restaurar tarefa", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Visão de tarefas").selectOption("all");
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page.getByRole("menuitem", { name: "Importar Markdown" }).click();
  await page.getByRole("textbox", { name: "Conteúdo Markdown" }).fill(markdown);
  await expect(page.getByText("1 tarefa para adicionar")).toBeVisible();
  await page.getByRole("button", { name: "Importar 1 tarefa" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Buscar tarefas").fill("orçamento");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("Buscar tarefas").fill("");
  const response = await page.request.get("/api/search?q=briefing");
  expect((await response.json()).tasks).toHaveLength(2);
  await page.screenshot({ path: "test-results/tasks-list-light.png" });
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await page.screenshot({ path: "test-results/tasks-board-light.png" });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await page.screenshot({ path: "test-results/tasks-board-dark.png" });
});

test("tasks: visual review of a populated board and editor in both themes", async ({
  page,
}) => {
  const { emptyTask, exportTasksMarkdown } = await import(
    "../src/domain/tasks"
  );
  await signUp(page, "Ana Silva");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page.getByRole("menuitem", { name: "Importar Markdown" }).click();
  const projects = [
    { id: "site", name: "Redesign do site", color: "lavender" as const },
    { id: "studio", name: "Estúdio criativo", color: "mint" as const },
  ];
  const tasks = [
    emptyTask({
      title: "Reunir referências para a nova identidade",
      projectId: "site",
      color: "lavender",
      tags: ["pesquisa"],
      subtasks: [
        { id: "s1", title: "Moodboard", done: true },
        { id: "s2", title: "Paleta", done: false },
      ],
    }),
    emptyTask({
      title: "Organizar os arquivos do projeto",
      projectId: "studio",
      color: "neutral",
      dueDate: "2026-10-21",
    }),
    emptyTask({
      title: "Desenhar a primeira versão da homepage",
      projectId: "site",
      color: "sky",
      status: "doing",
      priority: "high",
      people: ["Ana Silva"],
      description:
        "Uma experiência mais leve, com espaço para o que importa.\n\n**Próximo passo:** apresentar a direção visual.",
      subtasks: [
        { id: "s1", title: "Wireframe", done: true },
        { id: "s2", title: "Visual", done: false },
        { id: "s3", title: "Protótipo", done: false },
      ],
    }),
    emptyTask({
      title: "Preparar apresentação para o cliente",
      projectId: "studio",
      color: "mint",
      status: "doing",
      dueDate: "2026-10-22",
      tags: ["cliente"],
    }),
    emptyTask({
      title: "Validar o orçamento da próxima fase",
      projectId: "site",
      color: "sand",
      status: "waiting",
      people: ["Marina"],
      pendingNote:
        "Aguardando aprovação da Marina para seguir com o desenvolvimento.",
    }),
    emptyTask({
      title: "Receber os textos revisados",
      color: "peach",
      status: "waiting",
      people: ["Bruno"],
      tags: ["conteúdo"],
    }),
    emptyTask({
      title: "Alinhar objetivos e escopo",
      projectId: "site",
      color: "rose",
      status: "done",
    }),
  ];
  await page
    .getByRole("textbox", { name: "Conteúdo Markdown" })
    .fill(exportTasksMarkdown(tasks, projects));
  await page.getByRole("button", { name: "Importar 7 tarefas" }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Quadro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.addStyleTag({
    content: "[data-sonner-toaster] { visibility: hidden !important; }",
  });
  await page.screenshot({
    path: "test-results/tasks-populated-light.png",
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: "test-results/tasks-populated-dark.png",
    animations: "disabled",
  });
  await expect(page.locator("[data-board-id=aggregate]")).toHaveCount(1);
  for (const width of [320, 390, 736, 1024, 1240]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const geometry = await page
      .locator("[data-board-id=aggregate]")
      .evaluate((board) => {
        const scroll = board.querySelector(".wp-task-board-scroll")!;
        const lanes = [
          ...board.querySelectorAll<HTMLElement>("[data-column-id]"),
        ];
        const cards = [...board.querySelectorAll<HTMLElement>("article")];
        return {
          width: scroll.clientWidth,
          lanes: lanes.map((lane) => lane.getBoundingClientRect().width),
          fits: cards.every((card) => card.scrollWidth <= card.clientWidth + 1),
          compact: cards.every(
            (card) => card.getBoundingClientRect().height < 130,
          ),
        };
      });
    expect(geometry.fits).toBe(true);
    expect(geometry.compact).toBe(true);
    if (width >= 1024)
      expect(
        geometry.lanes.reduce((sum, value) => sum + value, 30),
      ).toBeLessThanOrEqual(geometry.width + 2);
    if (width === 1024)
      await page.screenshot({
        path: "test-results/tasks-compact-1024-dark.png",
        animations: "disabled",
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", {
      name: "Desenhar a primeira versão da homepage",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Visualizar", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Próximo passo:", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/tasks-editor-dark.png",
    animations: "disabled",
  });
});

test("tasks: inline capture, card actions, visible filters and batch organization", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que precisa ser feito?").fill("Organizar a entrega");
  await page.getByLabel("Nova subtarefa").fill("Revisar arquivos");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const first = page.getByRole("article", {
    name: "Tarefa: Organizar a entrega",
  });
  await expect(first).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar em Em andamento", exact: true })
    .click();
  await page.getByLabel("Nome da tarefa rápida").fill("Apresentar proposta");
  await page.getByLabel("Nome da tarefa rápida").press("Enter");
  const second = page.getByRole("article", {
    name: "Tarefa: Apresentar proposta",
  });
  await expect(second).toBeVisible();
  await page.getByLabel("Nome da tarefa rápida").fill("Preparar reunião");
  await page.getByRole("button", { name: "Abrir editor completo" }).click();
  await expect(page.getByLabel("O que precisa ser feito?")).toHaveValue(
    "Preparar reunião",
  );
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await first
    .getByRole("button", { name: "Subtarefas de Organizar a entrega" })
    .click();
  await page.getByLabel("Concluir Revisar arquivos").check();
  await expect(first).toContainText("1/1");
  await page.keyboard.press("Escape");
  await second
    .getByRole("button", { name: "Definir data", exact: true })
    .click();
  await page.getByRole("button", { name: /^Amanhã/ }).click();
  await expect(
    second.getByRole("button", { name: /^Alterar data:/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por etapa").selectOption("doing");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Em andamento", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Selecionar tarefas", exact: true })
    .click();
  await page.getByLabel("Selecionar Organizar a entrega").check();
  await page.getByLabel("Selecionar Apresentar proposta").check();
  const selection = page.getByRole("region", { name: "Ações da seleção" });
  await selection.getByRole("button", { name: "Etapa", exact: true }).click();
  await page.getByRole("menuitem", { name: "Concluído", exact: true }).click();
  await expect(selection).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Concluído", exact: true })
      .getByRole("article"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Opções de tarefas" }).click();
  await page.getByRole("menuitem", { name: "Ocultar concluídas" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Concluídas ocultas", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.reload();
  await expect(first).toContainText("1/1");
  await expect(
    second.getByRole("button", { name: /^Alterar data:/ }),
  ).toBeVisible();
});
