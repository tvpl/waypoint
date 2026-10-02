import { NextResponse, type NextRequest } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { getCollection, listFavorites } from "@/server/services/links";
import { toBookmarksHtml } from "@/server/lib/bookmarks";
import { buildExportTree, collectionPaths, fileSlug, linksToCsv, type ExportNode } from "@/features/links/export-format";
import { findNode, visibleTree } from "@/features/links/server-data";

/**
 * GET /api/export/links?format=json|csv|html&c=<collectionId>
 * Downloads the whole workspace library (or one collection subtree).
 * HTML is the Netscape bookmarks format any browser can import, preserving folders.
 */
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = req.nextUrl.searchParams.get("format") ?? "html";
  if (!["json", "csv", "html"].includes(format)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  const cId = req.nextUrl.searchParams.get("c");

  const { tree } = visibleTree(ctx.workspace.id, ctx.user.id);
  let nodes = tree;
  let rootName = ctx.workspace.name;
  if (cId) {
    const col = getCollection(cId);
    const node = findNode(tree, cId);
    if (!col || col.workspaceId !== ctx.workspace.id || !node) return NextResponse.json({ error: "Coleção não encontrada." }, { status: 404 });
    nodes = node.children;
    rootName = node.name;
  }
  const favs = listFavorites(ctx.workspace.id, ctx.user.id, { collectionId: cId ?? undefined, deep: true, sort: "manual", limit: 100_000 });
  const links = favs.map((f) => ({
    title: f.title,
    url: f.url,
    collectionId: f.collectionId === cId ? null : f.collectionId,
    tags: f.tags,
    description: f.description,
    keywords: f.keywords,
    createdAt: f.createdAt.getTime(),
  }));
  const exportNodes: ExportNode[] = nodes;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `waypoint-${fileSlug(rootName)}-${stamp}`;
  const disposition = (ext: string) => `attachment; filename="${base}.${ext}"`;

  if (format === "csv") {
    return new Response("﻿" + linksToCsv(exportNodes, links), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition("csv"), "Cache-Control": "no-store" },
    });
  }
  if (format === "html") {
    return new Response(toBookmarksHtml(buildExportTree(exportNodes, links, rootName)), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": disposition("html"), "Cache-Control": "no-store" },
    });
  }
  const paths = collectionPaths(exportNodes);
  const strip = (n: (typeof nodes)[number]): unknown => ({
    id: n.id,
    name: n.name,
    description: n.description,
    icon: n.icon,
    color: n.color,
    children: n.children.map(strip),
  });
  const json = {
    exportedAt: new Date().toISOString(),
    workspace: ctx.workspace.name,
    root: rootName,
    collections: nodes.map(strip),
    links: favs.map((f) => ({
      title: f.title,
      url: f.url,
      collection: f.collectionId && f.collectionId !== cId ? (paths.get(f.collectionId) ?? null) : null,
      collectionId: f.collectionId,
      tags: f.tags,
      description: f.description,
      keywords: f.keywords,
      coverImage: f.coverImage,
      openBehavior: f.openBehavior,
      summaryBehavior: f.summaryBehavior,
      createdAt: f.createdAt.toISOString(),
      openCount: f.openCount,
    })),
  };
  return new Response(JSON.stringify(json, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": disposition("json"), "Cache-Control": "no-store" },
  });
}
