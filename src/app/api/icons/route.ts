import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/server/services/workspaces";
import { searchIcons, type IconEntry } from "@/server/lib/icons";

export type IconsResponse = { icons: IconEntry[] };

/** GET /api/icons?q=banco&set=ui|brand → icons for the planner's library (Lucide and brand logos). */
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 60);
  const setParam = url.searchParams.get("set");
  const set = setParam === "ui" || setParam === "brand" ? setParam : undefined;
  return NextResponse.json({ icons: searchIcons(q, { set }) } satisfies IconsResponse, { headers: { "Cache-Control": "private, max-age=3600" } });
}
