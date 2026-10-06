import "server-only";
import { icons as lucideIcons } from "lucide";
import * as simpleIcons from "simple-icons";
import type { Glyph } from "@/domain/plan";

/** One icon of the library: interface icons (Lucide) or brand logos (Simple Icons). */
export type IconEntry = {
  id: string;
  name: string;
  set: "ui" | "brand";
  glyph: Glyph;
  /** Brand color (logos). */
  color?: string;
};

type LucideNode = [string, Record<string, string | number>][];

const num = (v: string | number | undefined) => Number(v ?? 0);
const pts = (v: string | number | undefined) =>
  String(v ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);

/** Lucide draws with circles, rects, lines and polylines too; everything becomes path data. */
function toPath([tag, a]: LucideNode[number]): string | null {
  switch (tag) {
    case "path":
      return String(a.d);
    case "circle": {
      const [cx, cy, r] = [num(a.cx), num(a.cy), num(a.r)];
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    case "ellipse": {
      const [cx, cy, rx, ry] = [num(a.cx), num(a.cy), num(a.rx), num(a.ry)];
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    }
    case "rect": {
      const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
      const r = Math.min(num(a.rx ?? a.ry), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
    }
    case "line":
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case "polyline":
    case "polygon": {
      const p = pts(a.points);
      let d = "";
      for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? "L" : "M"}${p[i]} ${p[i + 1]}`;
      return tag === "polygon" ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

let cache: IconEntry[] | null = null;

export function allIcons(): IconEntry[] {
  if (cache) return cache;
  const out: IconEntry[] = [];
  for (const [name, node] of Object.entries(lucideIcons as unknown as Record<string, LucideNode>)) {
    const paths = node.map(toPath).filter((d): d is string => !!d);
    if (!paths.length) continue;
    const id = kebab(name);
    out.push({ id: `lucide:${id}`, name: id.replace(/-/g, " "), set: "ui", glyph: { id: `lucide:${id}`, viewBox: "0 0 24 24", paths } });
  }
  for (const [key, icon] of Object.entries(simpleIcons as unknown as Record<string, { title: string; slug: string; path: string; hex: string }>)) {
    // A few logos are too detailed to keep in a document.
    if (!key.startsWith("si") || !icon?.path || icon.path.length > 40000) continue;
    out.push({ id: `si:${icon.slug}`, name: icon.title, set: "brand", glyph: { id: `si:${icon.slug}`, viewBox: "0 0 24 24", paths: [icon.path], filled: true }, color: `#${icon.hex.toUpperCase()}` });
  }
  cache = out;
  return out;
}

/** Portuguese words people type, to the English names icons have. */
const ALIASES: Record<string, string[]> = {
  banco: ["database"],
  "banco de dados": ["database"],
  dados: ["database"],
  usuario: ["user"],
  usuarios: ["users"],
  pessoa: ["user"],
  pessoas: ["users"],
  equipe: ["users"],
  time: ["users"],
  cliente: ["user"],
  nuvem: ["cloud"],
  servidor: ["server"],
  fila: ["list", "queue", "inbox"],
  mensagem: ["message", "mail"],
  email: ["mail"],
  celular: ["smartphone"],
  telefone: ["phone"],
  computador: ["monitor", "laptop"],
  pasta: ["folder"],
  arquivo: ["file"],
  documento: ["file-text"],
  cadeado: ["lock"],
  seguranca: ["shield", "lock"],
  chave: ["key"],
  grafico: ["chart"],
  dinheiro: ["banknote", "dollar", "wallet"],
  pagamento: ["credit-card", "wallet", "banknote"],
  cartao: ["credit-card"],
  carrinho: ["shopping-cart"],
  loja: ["store"],
  configuracao: ["settings"],
  ajustes: ["settings", "sliders"],
  calendario: ["calendar"],
  relogio: ["clock"],
  tempo: ["clock", "timer"],
  casa: ["house"],
  inicio: ["house"],
  busca: ["search"],
  buscar: ["search"],
  alerta: ["alert", "bell"],
  aviso: ["alert", "triangle-alert"],
  notificacao: ["bell"],
  robo: ["bot"],
  ia: ["bot", "brain", "sparkles"],
  cerebro: ["brain"],
  rede: ["network", "wifi"],
  internet: ["globe", "wifi"],
  mundo: ["globe"],
  mapa: ["map"],
  local: ["map-pin"],
  caminhao: ["truck"],
  entrega: ["truck", "package"],
  pacote: ["package"],
  caixa: ["box", "package"],
  ferramenta: ["wrench", "hammer"],
  codigo: ["code"],
  terminal: ["terminal"],
  livro: ["book"],
  estrela: ["star"],
  coracao: ["heart"],
  olho: ["eye"],
  lixo: ["trash"],
  lixeira: ["trash"],
  editar: ["pencil", "pen"],
  lapis: ["pencil"],
  seta: ["arrow"],
  check: ["check"],
  certo: ["check"],
  erro: ["x", "circle-x"],
  fogo: ["flame"],
  raio: ["zap"],
  energia: ["zap", "battery"],
  bateria: ["battery"],
  camera: ["camera"],
  foto: ["image", "camera"],
  imagem: ["image"],
  video: ["video"],
  musica: ["music"],
  som: ["volume"],
  microfone: ["mic"],
  chat: ["message-circle", "messages-square"],
  conversa: ["message-circle"],
  fabrica: ["factory"],
  predio: ["building"],
  empresa: ["building"],
  escola: ["school", "graduation-cap"],
  hospital: ["hospital"],
  saude: ["heart-pulse", "stethoscope"],
  sol: ["sun"],
  lua: ["moon"],
  chuva: ["cloud-rain"],
  api: ["webhook", "plug", "braces"],
  integracao: ["plug", "webhook", "workflow"],
  fluxo: ["workflow", "git-branch"],
  processo: ["workflow", "cog"],
  engrenagem: ["cog", "settings"],
  cpu: ["cpu"],
  memoria: ["memory-stick"],
  disco: ["hard-drive"],
  armazenamento: ["hard-drive", "database"],
  "ponto de interrogacao": ["circle-question-mark"],
  ajuda: ["circle-help", "life-buoy"],
  login: ["log-in"],
  sair: ["log-out"],
  bandeira: ["flag"],
  alvo: ["target"],
  meta: ["target", "goal"],
  ideia: ["lightbulb"],
  lampada: ["lightbulb"],
  documentos: ["files"],
  planilha: ["sheet", "table"],
  tabela: ["table"],
  lista: ["list"],
  tarefa: ["list-todo", "square-check"],
  presente: ["gift"],
  trofeu: ["trophy"],
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Icons matching `q` (names, then Portuguese aliases), best matches first. */
export function searchIcons(q: string, opts: { set?: "ui" | "brand"; limit?: number } = {}): IconEntry[] {
  const limit = opts.limit ?? 96;
  const list = allIcons().filter((i) => !opts.set || i.set === opts.set);
  const query = fold(q);
  if (!query) {
    // Something useful before typing: common architecture pieces and popular brands.
    const picks = new Set(SUGGESTED);
    return list.filter((i) => picks.has(i.id)).sort((a, b) => SUGGESTED.indexOf(a.id) - SUGGESTED.indexOf(b.id)).slice(0, limit);
  }
  const terms = [query, ...(ALIASES[query] ?? [])];
  const scored: { i: IconEntry; s: number }[] = [];
  for (const i of list) {
    const name = fold(i.name);
    const slug = i.id.slice(i.id.indexOf(":") + 1);
    let best = 0;
    for (const [k, t] of terms.entries()) {
      const w = k === 0 ? 1 : 0.9;
      if (name === t || slug === t) best = Math.max(best, 100 * w);
      else if (name.startsWith(t) || slug.startsWith(t)) best = Math.max(best, 70 * w);
      else if (name.includes(t) || slug.includes(t.replace(/\s+/g, "-"))) best = Math.max(best, 40 * w);
    }
    if (best) scored.push({ i, s: best - name.length * 0.1 + (i.set === "ui" ? 0.5 : 0) });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.i);
}

const SUGGESTED = [
  "lucide:user",
  "lucide:users",
  "lucide:monitor",
  "lucide:smartphone",
  "lucide:globe",
  "lucide:server",
  "lucide:database",
  "lucide:hard-drive",
  "lucide:cloud",
  "lucide:shield",
  "lucide:lock",
  "lucide:key-round",
  "lucide:mail",
  "lucide:message-square",
  "lucide:bell",
  "lucide:file-text",
  "lucide:folder",
  "lucide:credit-card",
  "lucide:shopping-cart",
  "lucide:package",
  "lucide:truck",
  "lucide:cpu",
  "lucide:bot",
  "lucide:workflow",
  "lucide:webhook",
  "lucide:network",
  "lucide:settings",
  "lucide:chart-line",
  "lucide:clock",
  "lucide:calendar",
  "si:postgresql",
  "si:mysql",
  "si:redis",
  "si:mongodb",
  "si:apachekafka",
  "si:rabbitmq",
  "si:docker",
  "si:kubernetes",
  "si:nginx",
  "si:nodedotjs",
  "si:python",
  "si:react",
  "si:nextdotjs",
  "si:github",
  "si:googlecloud",
  "si:cloudflare",
  "si:vercel",
  "si:stripe",
];
