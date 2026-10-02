// New tab: quick access, library search and recent work, from GET /api/v1/home.
import { api, getSettings } from "./lib/api.js";

const $ = (id) => document.getElementById(id);
const TINTS = [
  ["#E8EDFF", "#2F4FD8"],
  ["#EFE9FF", "#5B3FC4"],
  ["#DDF4EE", "#0F6E5C"],
  ["#FFEADB", "#A84A0F"],
  ["#FDE7F0", "#A6265E"],
  ["#E6F4DD", "#3B6B1E"],
  ["#FFF3C4", "#6B4F00"],
];
// Same hash as monogramColors() in the app, so tiles match.
function tint(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
const shortName = (t) => t.split(/\s[|–—·:-]\s/)[0].trim() || t;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

function favicon(src, label) {
  const box = el("span", { class: "fav" });
  if (src) {
    const img = el("img", { src, alt: "", referrerpolicy: "no-referrer", loading: "lazy" });
    img.addEventListener("error", () => img.replaceWith(document.createTextNode((label[0] || "?").toUpperCase())));
    box.append(img);
  } else box.append((label[0] || "?").toUpperCase());
  return box;
}

let settings;
function recordOpen(id) {
  api(settings, `/links/${encodeURIComponent(id)}/open`, { method: "POST" }).catch(() => {});
}

function greet() {
  const h = new Date().getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function renderDial(links) {
  const ul = $("dial");
  ul.replaceChildren(
    ...links.map((l, i) => {
      const [bg, ink] = tint(l.domain || l.title);
      const tile = el("span", { class: "tile", style: { "--tint": bg, "--tint-ink": ink } });
      tile.style.setProperty("--tint", bg);
      tile.style.setProperty("--tint-ink", ink);
      if (l.favicon) {
        const img = el("img", { src: l.favicon, alt: "", referrerpolicy: "no-referrer" });
        const icon = el("span", { class: "icon" }, img);
        img.addEventListener("error", () => icon.replaceWith(el("span", { class: "letter" }, (l.title[0] || "?").toUpperCase())));
        tile.append(icon);
      } else tile.append(el("span", { class: "letter" }, (l.title[0] || "?").toUpperCase()));
      if (l.pinned) tile.append(el("span", { class: "pin", "aria-label": "Fixado" }));
      if (i < 9) tile.append(el("kbd", { class: "num" }, String(i + 1)));
      return el("li", {}, el("a", { href: l.url, title: `${l.title}\n${l.domain}`, onclick: () => recordOpen(l.id) }, tile, el("span", { class: "name" }, shortName(l.title))));
    }),
  );
  $("dial-section").hidden = links.length === 0;
}

function renderList(id, items, linkOf) {
  $(id).replaceChildren(
    ...items.map((it) => {
      const { href, title, sub, icon, onclick } = linkOf(it);
      return el("li", {}, el("a", { href, onclick }, icon, el("span", { class: "txt" }, el("span", { class: "t" }, title), sub ? el("span", { class: "d" }, sub) : null)));
    }),
  );
  $(`${id}-section`).hidden = items.length === 0;
}

// ---------------------------------------------------------------- search
let results = [];
let active = 0;
let timer = 0;
let ctrl = null;
function renderResults() {
  const ul = $("results");
  ul.hidden = results.length === 0;
  ul.replaceChildren(
    ...results.map((l, i) =>
      el(
        "li",
        {},
        el(
          "a",
          { href: l.url, class: i === active ? "active" : null, onclick: () => recordOpen(l.id) },
          favicon(l.favicon, l.title),
          el("span", { class: "txt" }, el("span", { class: "t" }, l.title), el("span", { class: "d" }, l.domain + (l.collection ? ` · ${l.collection.name}` : ""))),
        ),
      ),
    ),
  );
}
$("q").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(timer);
  ctrl?.abort();
  if (!q) {
    results = [];
    renderResults();
    return;
  }
  timer = setTimeout(async () => {
    ctrl = new AbortController();
    try {
      const data = await api(settings, `/links?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal });
      results = data.links;
      active = 0;
      renderResults();
    } catch {}
  }, 140);
});
$("q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    active = (active + (e.key === "ArrowDown" ? 1 : results.length - 1)) % Math.max(results.length, 1);
    renderResults();
  } else if (e.key === "Escape") {
    e.target.value = "";
    results = [];
    renderResults();
  }
});
$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const pick = results[active];
  if (!pick) return;
  recordOpen(pick.id);
  location.href = pick.url;
});

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") {
    e.preventDefault();
    $("q").focus();
    return;
  }
  const n = Number(e.key);
  const tiles = $("dial").querySelectorAll("a");
  if (n >= 1 && n <= 9 && tiles[n - 1]) {
    e.preventDefault();
    tiles[n - 1].click();
  }
});

// ---------------------------------------------------------------- boot
$("date").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

(async () => {
  settings = await getSettings();
  if (!settings.serverUrl || !settings.token) {
    $("setup").hidden = false;
    $("search").hidden = true;
    return;
  }
  try {
    const home = await api(settings, "/home");
    $("greet").textContent = `${greet()}, ${home.user.name.split(/\s+/)[0]}`;
    const app = $("app-link");
    app.href = home.appUrl;
    app.hidden = false;
    renderDial(home.quick);
    renderList("recent", home.recent, (l) => ({ href: l.url, title: l.title, sub: l.domain, icon: favicon(l.favicon, l.title), onclick: () => recordOpen(l.id) }));
    renderList("plans", home.plans, (p) => ({ href: p.url, title: p.title, sub: null, icon: favicon(null, p.title) }));
    const sig = [];
    if (home.inbox.count) sig.push(el("a", { href: home.inbox.url, class: "accent" }, `${home.inbox.count} na caixa de entrada`));
    if (home.broken.count) sig.push(el("a", { href: home.broken.url, class: "danger" }, `${home.broken.count} links quebrados`));
    $("signals").replaceChildren(...sig);
  } catch (e) {
    $("error").hidden = false;
    $("error").textContent = e.message;
  }
})();
