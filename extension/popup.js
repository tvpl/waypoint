import { api, ApiError, getSettings, hostOf, isSavableUrl, normalizeTag, saveSettings } from "./lib/api.js";

const $ = (id) => document.getElementById(id);
const state = {
  settings: null,
  page: { url: "", title: "", favicon: "" },
  me: null,
  collections: [],
  tagNames: [],
  tags: [],
  collectionId: null,
  existing: null,
  saving: false,
};

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$("mod-key").textContent = isMac ? "⌘" : "Ctrl";

function setView(view) {
  document.body.dataset.view = view;
}

function icon(name, cls = "i") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function openOptions() {
  chrome.runtime.openOptionsPage();
  window.close();
}

function openTab(url) {
  chrome.tabs.create({ url });
  window.close();
}

// ---------------------------------------------------------------- messages

const MESSAGES = {
  setup: {
    icon: "key",
    title: "Conecte o Waypoint",
    text: "Informe o endereço do seu Waypoint e um token de API para começar a salvar links.",
    primary: ["Abrir configurações", openOptions],
  },
  token: {
    icon: "key",
    tone: "danger",
    title: "Token inválido",
    text: "O token foi revogado ou não existe mais. Crie um novo em Configurações → Tokens de API no Waypoint.",
    primary: ["Atualizar token", openOptions],
  },
  readonly: {
    icon: "alert",
    tone: "amber",
    title: "Somente leitura",
    text: "",
    primary: ["Abrir configurações", openOptions],
  },
  offline: {
    icon: "wifi-off",
    tone: "danger",
    title: "Sem conexão",
    text: "",
    primary: ["Tentar de novo", () => init()],
    secondary: ["Configurações", openOptions],
  },
  unsupported: {
    icon: "bookmark",
    title: "Esta página não pode ser salva",
    text: "Só é possível salvar endereços http(s). Abra uma página da web e tente de novo.",
    primary: ["Fechar", () => window.close()],
  },
};

function showMessage(kind, text) {
  const m = MESSAGES[kind];
  const iconBox = $("msg-icon");
  iconBox.className = `message-icon${m.tone ? ` ${m.tone}` : ""}`;
  iconBox.replaceChildren(icon(m.icon));
  $("msg-title").textContent = m.title;
  $("msg-text").textContent = text ?? m.text;
  const [pLabel, pFn] = m.primary;
  const primary = $("msg-primary");
  primary.textContent = pLabel;
  primary.onclick = pFn;
  const secondary = $("msg-secondary");
  secondary.hidden = !m.secondary;
  if (m.secondary) {
    secondary.textContent = m.secondary[0];
    secondary.onclick = m.secondary[1];
  }
  setView("message");
  primary.focus();
}

function showApiError(e) {
  if (!(e instanceof ApiError)) return showMessage("offline", "Algo deu errado ao falar com o Waypoint.");
  if (e.code === "not_configured") return showMessage("setup");
  if (e.status === 401) return showMessage("token");
  if (e.status === 0) return showMessage("offline", e.message);
  return showMessage("offline", e.message);
}

// ---------------------------------------------------------------- current page

async function currentPage() {
  // a link picked from the context menu (stored by background.js) wins over the active tab
  try {
    const { pending } = await chrome.storage.session.get("pending");
    if (pending && Date.now() - pending.at < 60_000) {
      await chrome.storage.session.remove("pending");
      return { url: pending.url, title: pending.title || "", favicon: pending.favicon || "" };
    }
  } catch {
    /* storage.session unavailable */
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url || "", title: tab?.title || "", favicon: tab?.favIconUrl || "" };
}

function renderPage() {
  const { url, title, favicon } = state.page;
  $("title").value = title;
  $("title").title = title;
  let shown = url;
  try {
    const u = new URL(url);
    shown = `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  } catch {
    /* keep raw */
  }
  $("page-url").textContent = shown;
  $("page-url").title = url;
  const img = $("favicon");
  const fallback = $("favicon-fallback");
  fallback.textContent = (hostOf(url).replace(/^www\./, "")[0] || "?").toUpperCase();
  if (favicon && /^(https?:|data:image\/)/.test(favicon)) {
    img.src = favicon;
    img.hidden = false;
    fallback.hidden = true;
    img.onerror = () => {
      img.hidden = true;
      fallback.hidden = false;
    };
  } else {
    img.hidden = true;
    fallback.hidden = false;
  }
}

// ---------------------------------------------------------------- collections picker

let activeIndex = 0;
let visibleOptions = [];

function collectionLabel(id) {
  const c = state.collections.find((x) => x.id === id);
  return c ? c : null;
}

function renderCollectionValue() {
  const c = collectionLabel(state.collectionId);
  const value = $("col-value");
  value.replaceChildren();
  if (!c) {
    value.textContent = "Sem coleção";
  } else {
    const parts = c.path.split(" / ");
    if (parts.length > 1) value.append(el("span", { class: "trail", text: `${parts.slice(0, -1).join(" / ")} / ` }));
    value.append(document.createTextNode(c.name));
  }
  value.parentElement.title = c ? c.path : "Sem coleção";
  $("col-icon").replaceWith(Object.assign(icon(c ? "folder" : "inbox"), { id: "col-icon" }));
}

function highlight(text, q) {
  const frag = document.createDocumentFragment();
  if (!q) {
    frag.append(text);
    return frag;
  }
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) {
    frag.append(text);
    return frag;
  }
  frag.append(text.slice(0, i), el("mark", { text: text.slice(i, i + q.length) }), text.slice(i + q.length));
  return frag;
}

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function renderPicker() {
  const q = $("col-search").value.trim();
  const fq = fold(q);
  const options = [{ id: null, name: "Sem coleção", path: "Sem coleção" }, ...state.collections];
  visibleOptions = fq ? options.filter((o) => fold(o.path).includes(fq)) : options;
  activeIndex = Math.max(0, Math.min(activeIndex, visibleOptions.length - 1));
  const list = $("col-list");
  list.replaceChildren();
  if (!visibleOptions.length) {
    list.append(el("li", { class: "empty", role: "presentation", text: `Nenhuma coleção com “${q}”.` }));
    return;
  }
  visibleOptions.forEach((o, i) => {
    const parts = o.path.split(" / ");
    const trail = parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
    const li = el(
      "li",
      {
        id: `col-opt-${i}`,
        role: "option",
        "aria-selected": String(o.id === state.collectionId),
        class: i === activeIndex ? "active" : "",
        onmousedown: (e) => e.preventDefault(),
        onclick: () => chooseCollection(o.id),
        onmousemove: () => setActive(i),
      },
      icon(o.id ? "folder" : "inbox"),
      el("span", { class: "name" }, highlight(o.name, q), trail ? el("span", { class: "trail", text: trail }) : null),
      icon("check", "i check"),
    );
    if (!q && o.depth) li.style.paddingLeft = `${8 + Math.min(o.depth, 4) * 12}px`;
    list.append(li);
  });
  $("col-search").setAttribute("aria-activedescendant", `col-opt-${activeIndex}`);
}

function setActive(i) {
  if (i === activeIndex) return;
  const list = $("col-list");
  list.children[activeIndex]?.classList.remove("active");
  activeIndex = i;
  const li = list.children[i];
  li?.classList.add("active");
  li?.scrollIntoView({ block: "nearest" });
  $("col-search").setAttribute("aria-activedescendant", `col-opt-${i}`);
}

function togglePicker(open) {
  const picker = $("col-picker");
  const willOpen = open ?? picker.hidden;
  picker.hidden = !willOpen;
  $("col-trigger").setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    $("col-search").value = "";
    const options = [null, ...state.collections.map((c) => c.id)];
    activeIndex = Math.max(0, options.indexOf(state.collectionId));
    renderPicker();
    $("col-search").focus();
    $(`col-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }
}

function chooseCollection(id) {
  state.collectionId = id;
  renderCollectionValue();
  togglePicker(false);
  $("col-trigger").focus();
}

$("col-trigger").addEventListener("click", () => togglePicker());
$("col-search").addEventListener("input", () => {
  activeIndex = 0;
  renderPicker();
});
$("col-search").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActive(Math.min(activeIndex + 1, visibleOptions.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActive(Math.max(activeIndex - 1, 0));
  } else if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const o = visibleOptions[activeIndex];
    if (o) chooseCollection(o.id);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    togglePicker(false);
    $("col-trigger").focus();
  }
});

// ---------------------------------------------------------------- tags

let suggestIndex = -1;

function renderTags() {
  const chips = $("tag-chips");
  chips.replaceChildren(
    ...state.tags.map((t) =>
      el(
        "span",
        { class: "chip" },
        `#${t}`,
        el("button", { type: "button", "aria-label": `Remover tag ${t}`, onclick: () => removeTag(t) }, icon("x")),
      ),
    ),
  );
  renderSuggestions();
}

function addTag(raw) {
  const t = normalizeTag(raw);
  if (t && !state.tags.includes(t) && state.tags.length < 40) state.tags.push(t);
  $("tag-input").value = "";
  suggestIndex = -1;
  renderTags();
}

function removeTag(t) {
  state.tags = state.tags.filter((x) => x !== t);
  renderTags();
  $("tag-input").focus();
}

function renderSuggestions() {
  const q = normalizeTag($("tag-input").value);
  const box = $("tag-suggest");
  const focused = document.activeElement === $("tag-input");
  const list = state.tagNames.filter((t) => !state.tags.includes(t) && (!q || t.includes(q))).slice(0, q ? 8 : 6);
  box.replaceChildren(
    ...list.map((t, i) =>
      el("li", {
        role: "option",
        id: `tag-opt-${i}`,
        "aria-selected": String(i === suggestIndex),
        class: i === suggestIndex ? "active" : "",
        text: `#${t}`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => {
          addTag(t);
          $("tag-input").focus();
        },
      }),
    ),
  );
  box.hidden = !focused || list.length === 0;
  box.dataset.count = String(list.length);
}

$("tags-shell").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) $("tag-input").focus();
});
$("tag-input").addEventListener("focus", renderSuggestions);
$("tag-input").addEventListener("blur", () => {
  if ($("tag-input").value.trim()) addTag($("tag-input").value);
  setTimeout(() => ($("tag-suggest").hidden = true), 0);
});
$("tag-input").addEventListener("input", () => {
  const v = $("tag-input").value;
  if (/[,;]/.test(v)) {
    v.split(/[,;]/).forEach((part, i, arr) => (i < arr.length - 1 ? addTag(part) : ($("tag-input").value = part)));
  }
  suggestIndex = -1;
  renderSuggestions();
});
$("tag-input").addEventListener("keydown", (e) => {
  const count = Number($("tag-suggest").dataset.count || 0);
  if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
    const v = $("tag-input").value;
    const pick = suggestIndex >= 0 ? $(`tag-opt-${suggestIndex}`)?.textContent?.slice(1) : null;
    if (pick || v.trim()) {
      e.preventDefault();
      addTag(pick || v);
    }
  } else if (e.key === "Backspace" && !$("tag-input").value && state.tags.length) {
    removeTag(state.tags[state.tags.length - 1]);
  } else if (e.key === "ArrowDown" && count) {
    e.preventDefault();
    suggestIndex = (suggestIndex + 1) % count;
    renderSuggestions();
  } else if (e.key === "ArrowUp" && count) {
    e.preventDefault();
    suggestIndex = suggestIndex <= 0 ? count - 1 : suggestIndex - 1;
    renderSuggestions();
  } else if (e.key === "Escape" && !$("tag-suggest").hidden) {
    e.preventDefault();
    e.stopPropagation();
    $("tag-suggest").hidden = true;
  }
});

// ---------------------------------------------------------------- existing link

function renderExisting() {
  const link = state.existing;
  $("saved-banner").hidden = !link;
  $("save-label").textContent = link ? "Salvar novamente" : "Salvar";
  if (!link) return;
  $("saved-where").textContent = link.archived
    ? "Arquivado"
    : link.collection
      ? `em ${link.collection.path}`
      : "em Sem coleção";
  $("saved-open").onclick = () => openTab(link.appUrl);
}

// ---------------------------------------------------------------- save

function setSaving(on) {
  state.saving = on;
  $("save").disabled = on;
  $("save-spinner").hidden = !on;
  $("save-label").textContent = on ? "Salvando…" : state.existing ? "Salvar novamente" : "Salvar";
}

function showFormError(msg) {
  $("form-error-text").textContent = msg;
  $("form-error").hidden = !msg;
}

async function save() {
  if (state.saving) return;
  if ($("tag-input").value.trim()) addTag($("tag-input").value);
  showFormError("");
  setSaving(true);
  try {
    const note = $("note").value.trim();
    const title = $("title").value.trim();
    const { link } = await api(state.settings, "/links", {
      method: "POST",
      body: {
        url: state.page.url,
        ...(title ? { title } : {}),
        ...(note ? { notes: note } : {}),
        collectionId: state.collectionId,
        tags: state.tags,
      },
    });
    await saveSettings({ lastCollectionId: state.collectionId });
    showSuccess(link);
  } catch (e) {
    setSaving(false);
    if (e instanceof ApiError && e.status === 401) return showMessage("token");
    showFormError(e instanceof ApiError ? e.message : "Não foi possível salvar. Tente de novo.");
  }
}

function showSuccess(link) {
  $("done-where").textContent = link.collection ? `Em ${link.collection.path}` : "Em Sem coleção";
  $("done-title").textContent = link.title;
  const img = $("done-favicon");
  const fav = link.favicon || state.page.favicon;
  img.hidden = !fav;
  if (fav) {
    img.src = fav;
    img.onerror = () => (img.hidden = true);
  }
  $("done-open").onclick = () => openTab(link.appUrl);
  $("done-close").onclick = () => window.close();
  setView("success");
  $("done-open").focus();
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  save();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && document.body.dataset.view === "form") {
    e.preventDefault();
    save();
  }
});
$("open-options").addEventListener("click", openOptions);

// ---------------------------------------------------------------- init

async function init() {
  setView("loading");
  state.settings = await getSettings();
  if (!state.settings.serverUrl || !state.settings.token) return showMessage("setup");
  state.page = await currentPage();
  if (!isSavableUrl(state.page.url)) return showMessage("unsupported");

  let me, cols, tags, lookup;
  try {
    [me, cols, tags, lookup] = await Promise.all([
      api(state.settings, "/me"),
      api(state.settings, "/collections"),
      api(state.settings, "/tags").catch(() => ({ tags: [] })),
      api(state.settings, `/links/lookup?url=${encodeURIComponent(state.page.url)}`).catch(() => ({ link: null })),
    ]);
  } catch (e) {
    return showApiError(e);
  }
  state.me = me;
  $("ws").textContent = me.workspace.name;
  $("ws").title = `Workspace ${me.workspace.name} · ${me.user.email}`;
  $("ws").hidden = false;
  if (!me.canWrite) {
    return showMessage("readonly", `Seu papel no workspace “${me.workspace.name}” é viewer: você pode consultar, mas não salvar links. Peça acesso de editor ou use um token de outro workspace.`);
  }
  state.collections = cols.collections;
  state.tagNames = tags.tags;
  state.existing = lookup.link;
  const last = state.settings.lastCollectionId;
  state.collectionId = last && state.collections.some((c) => c.id === last) ? last : null;

  renderPage();
  renderCollectionValue();
  renderTags();
  renderExisting();
  setView("form");
  $("title").focus();
  $("title").setSelectionRange($("title").value.length, $("title").value.length);
}

init();
