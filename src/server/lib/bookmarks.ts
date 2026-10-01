/** Netscape Bookmark File format (exported by Chrome, Edge, Firefox, Safari). */
import type { ImportFolder } from "../services/links";
import { decodeEntities } from "./html-meta";

export function parseBookmarksHtml(html: string): ImportFolder {
  const root: ImportFolder = { name: "Importados", children: [], links: [] };
  const stack: ImportFolder[] = [];
  let pending: ImportFolder | null = null;
  const re = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const token = m[0].slice(0, 3).toLowerCase();
    if (m[1] !== undefined) {
      pending = { name: text(m[1]) || "Pasta", children: [], links: [] };
      (stack.at(-1) ?? root).children.push(pending);
    } else if (token === "<dl") {
      stack.push(pending ?? (stack.length === 0 ? root : (stack.at(-1) as ImportFolder)));
      pending = null;
    } else if (token === "</d") {
      stack.pop();
    } else if (m[2] !== undefined) {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2]);
      const url = decodeEntities(href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const add = /add_date\s*=\s*"?(\d+)/i.exec(m[2]);
      (stack.at(-1) ?? root).links.push({
        title: text(m[3]) || url,
        url,
        addedAt: add ? Number(add[1]) * 1000 : undefined,
      });
    }
  }
  // Browsers wrap everything in a "Bookmarks bar"-like single folder; keep it as is.
  return root;
}

function text(s: string) {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type ExportFolder = { name: string; children: ExportFolder[]; links: { title: string; url: string; addedAt?: number; tags?: string[] }[] };

export function toBookmarksHtml(root: ExportFolder): string {
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
  ];
  const walk = (f: ExportFolder, indent: string) => {
    lines.push(`${indent}<DL><p>`);
    for (const c of f.children) {
      lines.push(`${indent}    <DT><H3>${esc(c.name)}</H3>`);
      walk(c, indent + "    ");
    }
    for (const l of f.links) {
      const date = l.addedAt ? ` ADD_DATE="${Math.floor(l.addedAt / 1000)}"` : "";
      const tags = l.tags?.length ? ` TAGS="${esc(l.tags.join(","))}"` : "";
      lines.push(`${indent}    <DT><A HREF="${esc(l.url)}"${date}${tags}>${esc(l.title)}</A>`);
    }
    lines.push(`${indent}</DL><p>`);
  };
  walk(root, "");
  return lines.join("\n") + "\n";
}
