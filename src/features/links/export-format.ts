/** Pure helpers for exporting the link library (CSV / JSON / Netscape HTML tree). */
import type { ExportFolder } from "@/server/lib/bookmarks";

/**
 * Escapes one CSV cell (RFC 4180) and neutralises spreadsheet formula
 * injection: cells starting with = + - @ (or tab / CR) are prefixed with '.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type ExportNode = { id: string; name: string; children: ExportNode[] };
export type ExportLinkRow = {
  title: string;
  url: string;
  collectionId: string | null;
  tags: string[];
  description: string | null;
  keywords: string | null;
  createdAt: number;
};

/** id → "Pai / Filho" for every node of the tree. */
export function collectionPaths(nodes: ExportNode[], prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    const p = prefix ? `${prefix} / ${n.name}` : n.name;
    out.set(n.id, p);
    collectionPaths(n.children, p, out);
  }
  return out;
}

/** Builds a Netscape-bookmarks folder tree; links outside the tree land at the root. */
export function buildExportTree(nodes: ExportNode[], links: ExportLinkRow[], rootName = "Waypoint"): ExportFolder {
  const byCollection = new Map<string | null, ExportLinkRow[]>();
  const known = collectionPaths(nodes);
  for (const l of links) {
    const key = l.collectionId && known.has(l.collectionId) ? l.collectionId : null;
    byCollection.set(key, [...(byCollection.get(key) ?? []), l]);
  }
  const toLinks = (rows: ExportLinkRow[] = []) => rows.map((l) => ({ title: l.title, url: l.url, addedAt: l.createdAt, tags: l.tags }));
  const walk = (n: ExportNode): ExportFolder => ({ name: n.name, children: n.children.map(walk), links: toLinks(byCollection.get(n.id)) });
  return { name: rootName, children: nodes.map(walk), links: toLinks(byCollection.get(null)) };
}

export const CSV_HEADER = ["Título", "URL", "Coleção", "Tags", "Descrição", "Palavras-chave", "Adicionado em"];

export function linksToCsv(nodes: ExportNode[], links: ExportLinkRow[]): string {
  const paths = collectionPaths(nodes);
  return toCsv(
    CSV_HEADER,
    links.map((l) => [
      l.title,
      l.url,
      (l.collectionId && paths.get(l.collectionId)) || "",
      l.tags.join(", "),
      l.description ?? "",
      l.keywords ?? "",
      new Date(l.createdAt).toISOString(),
    ]),
  );
}

/** Safe file name fragment ("Minha coleção" → "minha-colecao"). */
export function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "links"
  );
}
