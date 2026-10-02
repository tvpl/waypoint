// Shared helpers for the popup, options page and background worker.
// Settings live in chrome.storage.local (never .sync: the token must stay on this device).

export const DEFAULTS = { serverUrl: "", token: "", lastCollectionId: null };

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export function saveSettings(patch) {
  return chrome.storage.local.set(patch);
}

/** "waypoint.empresa.com/" → "https://waypoint.empresa.com" (origin only). Throws on invalid input. */
export function normalizeServer(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Informe o endereço do Waypoint.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `${/^(localhost|127\.|\[::1\])/i.test(s) ? "http" : "https"}://${s}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Endereço inválido.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use um endereço http(s).");
  return url.origin;
}

export const originPattern = (serverUrl) => `${new URL(serverUrl).origin}/*`;

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Calls the Waypoint REST API (/api/v1) with the personal token. */
export async function api(settings, path, { method = "GET", body, signal } = {}) {
  if (!settings.serverUrl || !settings.token) throw new ApiError(0, "not_configured", "Configure o endereço do Waypoint e o token de API.");
  let res;
  try {
    res = await fetch(`${settings.serverUrl}/api/v1${path}`, {
      method,
      signal,
      credentials: "omit",
      cache: "no-store",
      headers: { Authorization: `Bearer ${settings.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    throw new ApiError(0, "network", `Não foi possível conectar a ${hostOf(settings.serverUrl)}.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = {
      401: "Token inválido ou revogado. Crie um novo em Configurações → Tokens de API.",
      403: "Seu papel neste workspace é somente leitura.",
      404: "Não encontrado.",
      429: "Muitas requisições. Tente novamente em instantes.",
    }[res.status];
    throw new ApiError(res.status, data?.error?.code ?? `http_${res.status}`, (res.status === 401 ? fallback : data?.error?.message) || fallback || `Erro ${res.status} no servidor.`);
  }
  return data;
}

/** Same normalization as tags in the app ("Design System" → "design-system"). */
export function normalizeTag(input) {
  return String(input)
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .slice(0, 48);
}

export const isSavableUrl = (url) => /^https?:\/\//i.test(url || "");
