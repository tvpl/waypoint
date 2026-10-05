import { NextResponse, type NextRequest } from "next/server";
import { DESKTOP_COOKIE, DESKTOP_SESSION_PATH, sameSecret } from "@/lib/desktop-gate";

const PUBLIC = [
  /^\/login/,
  /^\/signup/,
  /^\/share\//,
  /^\/api\/share\//,
  /^\/api\/assets\//,
  /^\/api\/embed-check$/,
  // public REST API: authenticates itself with Bearer tokens (see app/api/v1/_lib/http.ts)
  /^\/api\/v1\//,
];

const FORBIDDEN_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Waypoint</title>
<body style="font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#686973">
<p>Este Waypoint roda no aplicativo de desktop. Abra o aplicativo para continuar.</p></body></html>`;

/**
 * Desktop mode (see src/server/desktop.ts): only the desktop window, which holds the per-launch
 * key, may use the server; the REST API keeps its own Bearer auth so the browser extension works.
 * There is no login screen: a window without a session gets one from DESKTOP_SESSION_PATH.
 */
function desktopGate(req: NextRequest, secret: string) {
  const { pathname, search } = req.nextUrl;
  if (/^\/api\/v1\//.test(pathname)) return NextResponse.next();
  const key = req.cookies.get(DESKTOP_COOKIE)?.value ?? req.headers.get("x-waypoint-desktop") ?? undefined;
  if (!sameSecret(key, secret)) return new NextResponse(FORBIDDEN_HTML, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  if (pathname.startsWith("/api/desktop/")) return NextResponse.next();
  if (!req.cookies.has("wp_session") || /^\/(login|signup)/.test(pathname)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = DESKTOP_SESSION_PATH;
    const next = /^\/(login|signup)/.test(pathname) ? (req.nextUrl.searchParams.get("next") ?? "/") : pathname + search;
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

/** Optimistic auth gate: real checks happen in each page/route. */
export function proxy(req: NextRequest) {
  const desktopSecret = process.env.WAYPOINT_DESKTOP_SECRET;
  if (desktopSecret) return desktopGate(req, desktopSecret);
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  // published plans can be opened by anyone when public; the page itself decides
  if (/^\/plans\/[^/]+$/.test(pathname) && !req.cookies.has("wp_session")) return NextResponse.next();
  if (!req.cookies.has("wp_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
