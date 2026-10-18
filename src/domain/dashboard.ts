import { z } from "zod";

/** Sections of the home dashboard, in their default order. `half` sections pair up side by side. */
export const HOME_WIDGETS = [
  { id: "shortcuts", label: "Atalhos", description: "Seus caminhos para qualquer página ou site", half: false },
  { id: "important", label: "Importantes", description: "Tarefas, plans e coleções com estrela", half: true },
  { id: "today", label: "Para hoje", description: "Tarefas do dia, atrasadas e retornos", half: true },
  { id: "links", label: "Links importantes", description: "Links que você marcou com estrela", half: false },
  { id: "recent", label: "Plans recentes", description: "Os diagramas em que você mexeu por último", half: false },
  { id: "attention", label: "Pede atenção", description: "Conversas abertas e links quebrados", half: true },
  { id: "inbox", label: "Caixa de entrada", description: "Links capturados para organizar", half: true },
  { id: "quick", label: "Acesso rápido", description: "Links fixados e mais usados", half: false },
  { id: "collections", label: "Coleções", description: "Coleções fixadas ou maiores", half: false },
] as const;
export type HomeWidget = (typeof HOME_WIDGETS)[number]["id"];
const WIDGET_IDS = HOME_WIDGETS.map((w) => w.id) as [HomeWidget, ...HomeWidget[]];

export const homeLayoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length),
  hidden: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length),
});
export type HomeLayout = z.infer<typeof homeLayoutSchema>;
export const defaultHomeLayout = (): HomeLayout => ({ order: [...WIDGET_IDS], hidden: [] });

/** Stored layout + any section added since it was saved (appended in its default place). */
export function normalizeLayout(raw: unknown): HomeLayout {
  const parsed = homeLayoutSchema.safeParse(raw);
  if (!parsed.success) return defaultHomeLayout();
  const order = [...new Set(parsed.data.order)];
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.splice(WIDGET_IDS.indexOf(id), 0, id);
  return { order, hidden: [...new Set(parsed.data.hidden)] };
}

// ---------------------------------------------------------------- shortcuts

export const SHORTCUT_ICONS = [
  "link",
  "plus",
  "sun",
  "list-todo",
  "check",
  "calendar",
  "workflow",
  "inbox",
  "star",
  "bookmark",
  "folder",
  "file-text",
  "chart",
  "shield",
  "help",
  "search",
  "mail",
  "users",
  "code",
  "rocket",
  "target",
  "zap",
  "globe",
  "settings",
] as const;
export type ShortcutIcon = (typeof SHORTCUT_ICONS)[number];
export const SHORTCUT_COLORS = ["accent", "lavender", "mint", "peach", "sky", "rose", "sand"] as const;
export type ShortcutColor = (typeof SHORTCUT_COLORS)[number];

/** A path inside Waypoint ("/tasks?scope=today") or an http(s) address. */
export const shortcutHrefSchema = z
  .string()
  .trim()
  .min(1, "Informe o endereço.")
  .max(2000, "Endereço muito longo.")
  .transform((v) => (/^(www\.|[a-z0-9-]+\.[a-z]{2,})(\/|$)/i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (v.startsWith("/")) return !v.startsWith("//") && !v.startsWith("/\\");
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Use um caminho do Waypoint (/tasks) ou um endereço http(s).");

export const shortcutInputSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome ao atalho.").max(60, "Use até 60 caracteres."),
  href: shortcutHrefSchema,
  icon: z.enum(SHORTCUT_ICONS).default("link"),
  color: z.enum(SHORTCUT_COLORS).default("accent"),
});
export type ShortcutInput = z.input<typeof shortcutInputSchema>;
export type HomeShortcut = z.output<typeof shortcutInputSchema> & { id: string; position: number };
export const MAX_SHORTCUTS = 24;

export const isExternal = (href: string) => /^https?:\/\//i.test(href);

export const SHORTCUT_PRESETS: (z.output<typeof shortcutInputSchema> & { hint: string })[] = [
  { title: "Nova tarefa", href: "/tasks?new=1", icon: "plus", color: "mint", hint: "Abre o editor de tarefa" },
  { title: "Meu dia", href: "/tasks?scope=today", icon: "sun", color: "peach", hint: "Tarefas de hoje e atrasadas" },
  { title: "Acompanhar", href: "/tasks?scope=followup", icon: "target", color: "sand", hint: "Retornos para revisitar" },
  { title: "Planner", href: "/plans", icon: "workflow", color: "lavender", hint: "Todos os plans" },
  { title: "Salvar link", href: "/links?add=1", icon: "bookmark", color: "sky", hint: "Adiciona um link à biblioteca" },
  { title: "Caixa de entrada", href: "/links?scope=inbox", icon: "inbox", color: "accent", hint: "Links para organizar" },
  { title: "Relatório de concluídas", href: "/tasks?report=1", icon: "chart", color: "mint", hint: "Markdown do que foi entregue" },
  { title: "Backup", href: "/settings?tab=backup", icon: "shield", color: "rose", hint: "Pontos de restauração" },
  { title: "Ajuda", href: "/help", icon: "help", color: "sky", hint: "Guias e tours" },
];
