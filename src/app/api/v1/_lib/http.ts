import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateBearer, type ApiPrincipal } from "@/server/services/api-tokens";
import { canEditWorkspace, UserError } from "@/server/services/workspaces";
import { rateLimit } from "@/server/lib/rate-limit";

/**
 * Shared plumbing for the public REST API (/api/v1/*):
 *  - Bearer personal tokens only (never the session cookie)
 *  - CORS only for browser-extension origins (chrome-extension://, moz-extension://)
 *  - per-token rate limits, JSON errors `{ error: { code, message } }`
 */
const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]{1,64}$/i;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && EXTENSION_ORIGIN.test(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}

/** OPTIONS preflight. */
export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...corsHeaders(req), ...init.headers },
  });
}

export function apiError(req: Request, status: number, code: string, message: string, headers?: Record<string, string>) {
  return json(req, { error: { code, message } }, { status, headers });
}

type Handler = (ctx: ApiPrincipal) => Promise<Response> | Response;

/**
 * Authenticates the Bearer token, applies the per-token rate limit and (for writes)
 * the editor check, then runs the handler with uniform error handling.
 */
export async function withApi(req: Request, opts: { write?: boolean; limit?: number }, handler: Handler): Promise<Response> {
  const principal = authenticateBearer(req);
  if (!principal) {
    return apiError(req, 401, "unauthorized", "Token ausente, inválido ou revogado.", { "WWW-Authenticate": 'Bearer realm="waypoint"' });
  }
  const bucket = opts.write ? "w" : "r";
  const rl = rateLimit(`api:${bucket}:${principal.tokenId}`, opts.limit ?? (opts.write ? 30 : 120), 60_000);
  if (!rl.ok) return apiError(req, 429, "rate_limited", "Muitas requisições. Tente novamente em instantes.", { "Retry-After": String(rl.retryAfter) });
  if (opts.write && !canEditWorkspace(principal.role)) {
    return apiError(req, 403, "forbidden", "Seu papel neste workspace é somente leitura.");
  }
  try {
    return await handler(principal);
  } catch (e) {
    if (e instanceof UserError) return apiError(req, 400, "invalid", e.message);
    if (e instanceof z.ZodError) return apiError(req, 400, "invalid", e.issues[0] ? `${e.issues[0].path.join(".") || "body"}: ${e.issues[0].message}` : "Dados inválidos.");
    console.error("[api v1]", req.method, new URL(req.url).pathname, e instanceof Error ? e.message : e);
    return apiError(req, 500, "internal", "Algo deu errado.");
  }
}
