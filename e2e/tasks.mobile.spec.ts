import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("tasks on a phone: navigation, editing, status menu and compact list", async ({
  page,
}) => {
  await signUp(page);
  await page.getByRole("link", { name: "Tarefas", exact: true }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que precisa ser feito?").fill("Organizar a semana");
  await page.getByLabel("Nova subtarefa").fill("Separar prioridades");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const card = page.getByRole("article", {
    name: "Tarefa: Organizar a semana",
  });
  await expect(card).toContainText("0/1");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(card).toContainText("A fazer");
  await card
    .getByRole("button", { name: "Ações de Organizar a semana" })
    .click();
  await page.getByRole("menuitem", { name: "Mover para etapa" }).click();
  await page.getByRole("menuitem", { name: "Aguardando", exact: true }).click();
  await expect(card).toContainText("Aguardando");
  await page.getByLabel("Visão de tarefas").selectOption("waiting");
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Organizar a semana", exact: true })
    .click();
  await page.getByLabel("Concluir Separar prioridades").check();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(card).toContainText("1/1");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/tasks-mobile-light.png",
    animations: "disabled",
  });
  await page.reload();
  await expect(card).toContainText("1/1");
});
