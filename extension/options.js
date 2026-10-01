import { api, ApiError, getSettings, normalizeServer, originPattern, saveSettings } from "./lib/api.js";

const $ = (id) => document.getElementById(id);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
document.querySelectorAll("[data-mod]").forEach((k) => (k.textContent = isMac ? "⌘" : "Ctrl"));
if (navigator.userAgent.includes("Firefox")) $("shortcuts-url").textContent = "about:addons → ⚙ → Gerenciar atalhos";

const PATHS = { ok: "M20 6 9 17l-5-5", error: "M12 8v4M12 16h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", warn: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" };

function status(kind, text) {
  const box = $("status");
  box.hidden = !text;
  box.className = `banner ${{ ok: "success", error: "danger", warn: "amber", info: "accent" }[kind] ?? ""}`;
  $("status-path").setAttribute("d", PATHS[kind] ?? PATHS.ok);
  $("status-text").textContent = text;
}

function busy(on) {
  $("save").disabled = on;
  $("spinner").hidden = !on;
  $("save-label").textContent = on ? "Testando…" : "Salvar e testar conexão";
}

async function load() {
  const s = await getSettings();
  $("server").value = s.serverUrl;
  $("token").value = s.token;
  if (s.serverUrl && s.token) test(s, { silentStart: true });
}

async function test(settings, { silentStart = false } = {}) {
  if (!silentStart) status("info", "Testando conexão…");
  try {
    const me = await api(settings, "/me");
    if (me.canWrite) status("ok", `Conectado como ${me.user.name} (${me.user.email}) · workspace “${me.workspace.name}”.`);
    else status("warn", `Conectado ao workspace “${me.workspace.name}”, mas seu papel é viewer: não será possível salvar links.`);
    return true;
  } catch (e) {
    status("error", e instanceof ApiError ? e.message : "Não foi possível testar a conexão.");
    return false;
  }
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let serverUrl;
  try {
    serverUrl = normalizeServer($("server").value);
  } catch (err) {
    status("error", err.message);
    $("server").focus();
    return;
  }
  const token = $("token").value.trim();
  if (!/^wp_[0-9A-Za-z]{40}$/.test(token)) {
    status("error", "O token deve começar com wp_ e ter 43 caracteres. Copie-o de novo em Configurações → Tokens de API.");
    $("token").focus();
    return;
  }
  // must run inside the click (user gesture), before any other await
  let granted = true;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(serverUrl)] });
  } catch {
    granted = false;
  }
  if (!granted) {
    status("warn", `Sem permissão para acessar ${new URL(serverUrl).host}. Autorize o acesso para a extensão falar com o Waypoint.`);
    return;
  }
  $("server").value = serverUrl;
  busy(true);
  await saveSettings({ serverUrl, token });
  await test({ serverUrl, token });
  busy(false);
});

$("toggle-token").addEventListener("click", () => {
  const show = $("token").type === "password";
  $("token").type = show ? "text" : "password";
  $("toggle-token").textContent = show ? "Ocultar" : "Mostrar";
  $("toggle-token").setAttribute("aria-pressed", String(show));
});

$("clear").addEventListener("click", async () => {
  const { serverUrl } = await getSettings();
  await chrome.storage.local.remove(["token", "lastCollectionId"]);
  $("token").value = "";
  if (serverUrl) chrome.permissions.remove({ origins: [originPattern(serverUrl)] }).catch(() => {});
  status("info", "Token removido deste navegador. Lembre-se de revogá-lo no Waypoint se não for mais usá-lo.");
});

$("tokens-link").addEventListener("click", (e) => {
  e.preventDefault();
  let base;
  try {
    base = normalizeServer($("server").value);
  } catch {
    status("warn", "Informe primeiro o endereço do Waypoint.");
    $("server").focus();
    return;
  }
  chrome.tabs.create({ url: `${base}/settings#api-tokens` });
});

load();
