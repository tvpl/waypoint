import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("reminders fit a narrow viewport and retain custom scheduling and snoozing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await signUp(page);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que precisa ser feito?")
    .fill("Acompanhar os pontos pendentes da revisão do projeto");
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Meus lembretes", exact: true })
    .click();
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await page
    .getByRole("button", { name: "Acompanhar em", exact: true })
    .click();
  await page.getByLabel("Dia", { exact: true }).fill("2028-10-20");
  await page.getByLabel("Horário limite", { exact: true }).fill("15:30");
  await page.getByLabel("Entrega", { exact: true }).selectOption("inbox");
  const fits = async () => {
    const dialog = page.getByRole("dialog", {
      name: /^(Meus lembretes|Agendar lembretes)$/,
    });
    expect(
      await dialog.evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      })),
    ).toEqual(expect.objectContaining({ width: 288, scroll: 288 }));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  };
  await fits();
  await page.screenshot({
    path: "/private/tmp/waypoint-reminder-mobile-compose.png",
  });
  await page
    .getByRole("button", { name: "Agendar lembrete", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Meus lembretes", exact: true }),
  ).toBeVisible();
  await fits();
  await page.getByRole("button", { name: /Reagendar lembrete de/ }).click();
  await expect(page.getByLabel("Dia", { exact: true })).toHaveValue(
    "2028-10-20",
  );
  await expect(
    page.getByRole("button", { name: "Acompanhar em", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Horário limite", { exact: true }).fill("16:00");
  await page
    .getByRole("button", { name: "Agendar lembrete", exact: true })
    .click();
  await expect(page.getByText(/16:00/).first()).toBeVisible();
  await page.getByRole("button", { name: /Adiar lembrete de/ }).click();
  await page.getByLabel("Adiar até", { exact: true }).fill("2028-10-21T09:00");
  await page
    .getByRole("button", { name: "Confirmar adiamento", exact: true })
    .click();
  await expect(page.getByText(/Adiado para/)).toBeVisible();
  await fits();
  await page.screenshot({
    path: "/private/tmp/waypoint-reminder-mobile-inbox.png",
    animations: "disabled",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    path: "/private/tmp/waypoint-reminder-mobile-dark.png",
    animations: "disabled",
  });
});
