import {
  dateSchema,
  fold,
  localDate,
  taskInputSchema,
  type TaskInput,
} from "./tasks";

/** Only standalone tokens are interpreted; unknown words and punctuation remain in the title. */
export function parseQuickTask(
  text: string,
  defaults: Partial<TaskInput> = {},
  today = localDate(),
): TaskInput {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const first = (lines.shift() ?? "").replace(/^\s*[-*]\s+\[[ xX]\]\s+/, "");
  const tags: string[] = [],
    people: string[] = [];
  let dueDate = defaults.dueDate ?? null;
  let priority = defaults.priority ?? "none";
  const title = first
    .replace(
      /(^|\s)(#[\p{L}\p{N}_-]+|@(?:"[^"\n]+"|[\p{L}\p{N}_.-]+)|!alta|!media|!média|!baixa|hoje|amanh[ãa]|\d{4}-\d{2}-\d{2})(?=\s|$)/giu,
      (match, space: string, token: string) => {
        if (token.startsWith("#")) tags.push(token.slice(1));
        else if (token.startsWith("@"))
          people.push(token.slice(1).replace(/^"|"$/g, ""));
        else if (token.startsWith("!"))
          priority = ({ alta: "high", media: "medium", baixa: "low" } as const)[
            fold(token.slice(1)) as "alta" | "media" | "baixa"
          ];
        else if (fold(token) === "hoje") dueDate = today;
        else if (fold(token) === "amanha") {
          const date = new Date(`${today}T12:00:00`);
          date.setDate(date.getDate() + 1);
          dueDate = localDate(date);
        } else {
          if (!dateSchema.safeParse(token).success) return match;
          dueDate = token;
        }
        return space;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
  const subtasks: TaskInput["subtasks"] = [];
  const notes: string[] = [];
  for (const line of lines) {
    const step = /^\s*[-*]\s+\[([ xX])\]\s+(.+)/.exec(line);
    if (step)
      subtasks.push({
        id: `capture-${subtasks.length + 1}`,
        title: step[2],
        done: step[1].toLowerCase() === "x",
      });
    else notes.push(line);
  }
  return taskInputSchema.parse({
    ...defaults,
    title,
    tags: [...new Set([...(defaults.tags ?? []), ...tags])],
    people: [...new Set([...(defaults.people ?? []), ...people])],
    dueDate,
    priority,
    description: [defaults.description, notes.join("\n").trim()]
      .filter(Boolean)
      .join("\n\n"),
    subtasks: [...(defaults.subtasks ?? []), ...subtasks],
  });
}
