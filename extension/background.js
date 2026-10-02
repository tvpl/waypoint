import { api, ApiError, getSettings, isSavableUrl } from "./lib/api.js";

const MENU_LINK = "waypoint-save-link";
const MENU_PAGE = "waypoint-save-page";

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_LINK, title: "Salvar link no Waypoint", contexts: ["link"], targetUrlPatterns: ["http://*/*", "https://*/*"] });
    chrome.contextMenus.create({ id: MENU_PAGE, title: "Salvar página no Waypoint", contexts: ["page"], documentUrlPatterns: ["http://*/*", "https://*/*"] });
  });
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isLink = info.menuItemId === MENU_LINK;
  const target = isLink
    ? { url: info.linkUrl, title: (info.linkText || info.selectionText || "").trim(), favicon: "" }
    : { url: info.pageUrl || tab?.url, title: tab?.title || "", favicon: tab?.favIconUrl || "" };
  if (!isSavableUrl(target.url)) return;
  // Prefer the popup (lets the user pick collection/tags); fall back to a quick save.
  try {
    await chrome.storage.session.set({ pending: { ...target, at: Date.now() } });
    await chrome.action.openPopup();
  } catch {
    await chrome.storage.session.remove("pending").catch(() => {});
    quickSave(target, tab?.id);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "quick-save") return;
  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!active || !isSavableUrl(active.url)) return badge("!", "#b42318", "Esta página não pode ser salva.", active?.id);
  quickSave({ url: active.url, title: active.title || "", favicon: active.favIconUrl || "" }, active.id);
});

/** Saves without UI, into the last used collection; reports through the toolbar badge. */
async function quickSave(target, tabId) {
  const settings = await getSettings();
  if (!settings.serverUrl || !settings.token) {
    chrome.runtime.openOptionsPage();
    return;
  }
  badge("…", "#2f4fd8", "Salvando no Waypoint…", tabId);
  try {
    const { link: existing } = await api(settings, `/links/lookup?url=${encodeURIComponent(target.url)}`);
    if (existing) return badge("✓", "#1f6b41", `Já estava salvo no Waypoint: ${existing.title}`, tabId);
    const { link } = await api(settings, "/links", {
      method: "POST",
      body: { url: target.url, ...(target.title ? { title: target.title } : {}), collectionId: settings.lastCollectionId ?? null },
    }).catch((e) => {
      // the remembered collection may have been deleted: retry without it
      if (e instanceof ApiError && e.code === "collection_not_found") return api(settings, "/links", { method: "POST", body: { url: target.url, title: target.title || undefined } });
      throw e;
    });
    badge("✓", "#1f6b41", `Salvo no Waypoint${link.collection ? ` em ${link.collection.path}` : ""}: ${link.title}`, tabId);
  } catch (e) {
    badge("!", "#b42318", e instanceof ApiError ? e.message : "Não foi possível salvar no Waypoint.", tabId);
    if (e instanceof ApiError && (e.status === 401 || e.code === "not_configured")) chrome.runtime.openOptionsPage();
  }
}

function badge(text, color, title, tabId) {
  const opts = tabId != null ? { tabId } : {};
  chrome.action.setBadgeBackgroundColor({ color, ...opts });
  chrome.action.setBadgeText({ text, ...opts });
  chrome.action.setTitle({ title, ...opts });
  if (text !== "…") {
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "", ...opts });
      chrome.action.setTitle({ title: "Salvar no Waypoint (Ctrl+Shift+S)", ...opts });
    }, 4000);
  }
}
