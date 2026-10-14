import {
  SORT_MODES,
  type SortMode,
  type SummaryMode,
  type LinkItem,
  type ViewMode,
} from "./types";

export type GroupMode = "none" | "domain" | "tag" | "date";
export type Density = "comfortable" | "dense";
export type LinkColumn =
  | "domain"
  | "collection"
  | "tags"
  | "created"
  | "visited";
export type DisplaySettings = {
  sort?: SortMode;
  summary?: SummaryMode;
  view?: ViewMode;
  group: GroupMode;
  density: Density;
  covers: boolean;
  columns: LinkColumn[];
  widths: Partial<Record<LinkColumn | "title", number>>;
};
export const GROUP_LABEL: Record<GroupMode, string> = {
  none: "Sem agrupamento",
  domain: "Domínio",
  tag: "Primeira tag",
  date: "Data de adição",
};
export const COLUMN_LABEL: Record<LinkColumn, string> = {
  domain: "Domínio",
  collection: "Coleção",
  tags: "Tags",
  created: "Adicionado",
  visited: "Último acesso",
};
export const DEFAULT_DISPLAY: DisplaySettings = {
  group: "none",
  density: "comfortable",
  covers: true,
  columns: ["collection", "tags", "created"],
  widths: {},
};

/** Preferences may come from an older version or malformed local storage. */
export function readDisplay(value: unknown): DisplaySettings {
  const v =
    value && typeof value === "object"
      ? (value as Partial<DisplaySettings>)
      : {};
  const widths: DisplaySettings["widths"] = {};
  for (const key of ["title", ...Object.keys(COLUMN_LABEL)] as const) {
    const n = v.widths?.[key as LinkColumn | "title"];
    if (typeof n === "number" && Number.isFinite(n))
      widths[key as LinkColumn | "title"] = Math.max(90, Math.min(600, n));
  }
  return {
    sort: SORT_MODES.includes(v.sort as SortMode) ? v.sort : undefined,
    summary: ["default", "always", "hover", "hidden"].includes(v.summary ?? "")
      ? v.summary
      : undefined,
    view: ["cards", "compact", "list"].includes(v.view ?? "")
      ? v.view
      : undefined,
    group: Object.hasOwn(GROUP_LABEL, v.group ?? "") ? v.group! : "none",
    density: v.density === "dense" ? "dense" : "comfortable",
    covers: v.covers !== false,
    columns: Array.isArray(v.columns)
      ? [...new Set(v.columns.filter((c) => Object.hasOwn(COLUMN_LABEL, c)))]
      : DEFAULT_DISPLAY.columns,
    widths,
  };
}

/** A link appears once, including when it has several tags; its first tag is its main tag. */
export function groupLinks(
  links: LinkItem[],
  mode: GroupMode,
  now = new Date(),
): { key: string; label: string; links: LinkItem[] }[] {
  if (mode === "none") return [{ key: "all", label: "", links }];
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const week = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  ).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const groups = new Map<string, LinkItem[]>();
  for (const link of links) {
    const key =
      mode === "domain"
        ? link.domain.replace(/^www\./, "") || "Sem domínio"
        : mode === "tag"
          ? link.tags[0]
            ? `#${link.tags[0]}`
            : "Sem tag"
          : link.createdAt >= today
            ? "Hoje"
            : link.createdAt >= week
              ? "Esta semana"
              : link.createdAt >= month
                ? "Este mês"
                : "Anteriores";
    const list = groups.get(key) ?? [];
    list.push(link);
    groups.set(key, list);
  }
  const order = ["Hoje", "Esta semana", "Este mês", "Anteriores"];
  return [...groups]
    .sort(([a], [b]) =>
      mode === "date"
        ? order.indexOf(a) - order.indexOf(b)
        : a.localeCompare(b, "pt-BR"),
    )
    .map(([key, list]) => ({ key, label: key, links: list }));
}

export function reorderLinks(
  items: LinkItem[],
  ids: string[],
  target: string,
  position: "before" | "after",
) {
  const moving = new Set(ids);
  if (moving.has(target)) return null;
  const rest = items.filter((l) => !moving.has(l.id));
  const index = rest.findIndex((l) => l.id === target);
  if (index < 0) return null;
  const at = index + (position === "after" ? 1 : 0);
  const dragged = items.filter((l) => moving.has(l.id));
  return {
    index: at,
    ids: [...rest.slice(0, at), ...dragged, ...rest.slice(at)].map((l) => l.id),
    moving: dragged.map((l) => l.id),
  };
}
