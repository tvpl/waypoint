/**
 * The built-in libraries: ready-made pieces for technical and product drawings. Each component has
 * a name, words to find it by, a default size, the fields you can change in the properties panel,
 * and how it is drawn (HTML/SVG in the node's box, readable in light and dark themes).
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Boxes,
  Brain,
  CalendarClock,
  Cloud,
  Cog,
  Combine,
  Container,
  Cpu,
  Database,
  DoorOpen,
  ExternalLink,
  FileJson,
  FileText,
  Flag,
  Gauge,
  Globe,
  HardDrive,
  Inbox,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Megaphone,
  Monitor,
  Network,
  PackageOpen,
  Plug,
  Radio,
  Rows3,
  Search,
  Server,
  Share2,
  ShieldCheck,
  Signpost,
  Smartphone,
  Split,
  SquareFunction,
  Table2,
  User,
  Users,
  Warehouse,
  Waves,
  Waypoints,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import type { ComponentValue, NodeData, NodeKind } from "@/domain/plan";

export type Props = Record<string, ComponentValue>;

export type Field =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | { key: string; label: string; kind: "long"; placeholder?: string }
  | { key: string; label: string; kind: "number"; min: number; max: number }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "list"; placeholder?: string; hint?: string }
  | { key: string; label: string; kind: "bool" };

export type RenderCtx = { title: string; props: Props; w: number; h: number };

export type ComponentDef = {
  pack: PackId;
  type: string;
  name: string;
  /** Words people search with (Portuguese and English). */
  keywords?: string;
  size: [number, number];
  title: string;
  defaults?: Props;
  fields?: Field[];
  render: (c: RenderCtx) => ReactNode;
  /** How it shows in the library when its drawing is too wide to read small: its icon and color. */
  glyph?: { icon: LucideIcon; color: string; solid?: boolean };
  /** Instead of a component, a plain element (areas such as an AWS region or a VPC). */
  preset?: { kind: NodeKind; data: Partial<NodeData> };
};

export const PACKS = [
  { id: "sistemas", name: "Sistemas", description: "Usuários, apps, APIs, serviços, cache, filas, gateways" },
  { id: "eda", name: "EDA e Kafka", description: "Tópicos com partições, filas, producers, consumers, brokers" },
  { id: "eventstorming", name: "Event Storming", description: "Eventos, comandos, agregados, políticas, read models" },
  { id: "dados", name: "Banco de dados", description: "Bancos, tabelas com colunas, data lake, warehouse" },
  { id: "aws", name: "Cloud (estilo AWS)", description: "Serviços com as cores das categorias da AWS, regiões e VPCs" },
  { id: "c4", name: "C4", description: "Pessoa, sistema, container e componente" },
  { id: "fluxo", name: "Fluxograma", description: "Início/fim, processo, decisão, documento, dados, espera" },
  { id: "ux", name: "Telas e wireframes", description: "Janelas, celular, botões, campos, tabelas, abas, gráficos" },
  { id: "produto", name: "Produto", description: "Persona, história de usuário, OKR, métrica, matriz 2×2, marco" },
] as const;
export type PackId = (typeof PACKS)[number]["id"];

// ------------------------------------------------------------------ helpers

const str = (v: ComponentValue | undefined, d = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: ComponentValue | undefined, d: number) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : d);
const list = (v: ComponentValue | undefined, d: string[] = []) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n").filter(Boolean) : d);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const tint = (hex: string, alpha: string) => `${hex}${alpha}`;

/** A service card: icon in a tinted square, name and a second line (the technology). */
function Card({ icon: Icon, color, title, sub, dashed }: { icon: LucideIcon; color: string; title: string; sub?: string; dashed?: boolean }) {
  return (
    <div className="flex h-full w-full items-center gap-2.5 overflow-hidden rounded-[10px] border bg-surface px-3" style={{ borderColor: dashed ? color : "var(--line)", borderStyle: dashed ? "dashed" : "solid" }}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(color, "1f"), color }}>
        <Icon size={18} strokeWidth={1.9} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold leading-tight text-ink">{title}</span>
        {sub && <span className="truncate text-[11px] leading-tight text-muted">{sub}</span>}
      </span>
    </div>
  );
}

/** A cloud service tile: white icon on the category color, the name under it. */
function Tile({ icon: Icon, color, title }: { icon: LucideIcon; color: string; title: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center gap-1.5">
      <span className="flex aspect-square w-[62%] max-w-[72px] shrink-0 items-center justify-center rounded-[22%] text-white shadow-[0_1px_2px_rgba(0,0,0,.15)]" style={{ background: color }}>
        <Icon className="size-[56%]" strokeWidth={1.7} aria-hidden />
      </span>
      <span className="line-clamp-2 text-center text-[12px] font-medium leading-tight text-ink-2">{title}</span>
    </div>
  );
}

const sub: Field = { key: "sub", label: "Tecnologia ou detalhe", kind: "text", placeholder: "Ex.: Node.js, Go, Redis 7" };

function card(pack: PackId, type: string, name: string, icon: LucideIcon, color: string, keywords = "", extra: Partial<ComponentDef> = {}): ComponentDef {
  return {
    pack,
    type,
    name,
    keywords,
    size: [200, 64],
    title: name,
    fields: [sub],
    render: ({ title, props }) => <Card icon={icon} color={color} title={title} sub={str(props.sub)} />,
    glyph: { icon, color },
    ...extra,
  };
}

// AWS category colors (the service names are AWS's; the drawings are ours).
const AWS = { compute: "#ED7100", storage: "#7AA116", database: "#C925D1", network: "#8C4FFF", integration: "#E7157B", security: "#DD344C", analytics: "#8C4FFF", ml: "#01A88D", management: "#E7157B" };

function tile(type: string, name: string, icon: LucideIcon, color: string, keywords = ""): ComponentDef {
  return { pack: "aws", type, name, keywords, size: [104, 104], title: name, glyph: { icon, color, solid: true }, render: ({ title }) => <Tile icon={icon} color={color} title={title} /> };
}

function area(type: string, name: string, color: string, keywords: string, dashed = false): ComponentDef {
  return {
    pack: "aws",
    type,
    name,
    keywords,
    size: [480, 300],
    title: name,
    render: ({ title }) => (
      <div className="h-full w-full rounded-md border-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}>
        <span className="m-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: color }}>
          {title}
        </span>
      </div>
    ),
    preset: { kind: "section", data: { title: name, color: undefined } },
  };
}

// ------------------------------------------------------------------ specific drawings

function Cylinder({ title, sub, color, icon: Icon }: { title: string; sub?: string; color: string; icon?: LucideIcon }) {
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M1 12 L1 88 A49 11 0 0 0 99 88 L99 12" fill="var(--surface)" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <ellipse cx={50} cy={12} rx={49} ry={11} fill={tint(color, "22")} stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-x-1 bottom-[14%] top-[26%] flex flex-col items-center justify-center gap-0.5 text-center">
        {Icon && <Icon size={16} style={{ color }} aria-hidden />}
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-ink">{title}</span>
        {sub && <span className="truncate text-[11px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

function Topic({ title, props }: RenderCtx) {
  const n = Math.min(12, Math.max(1, num(props.partitions, 3)));
  const color = "#E37400";
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <Rows3 size={14} style={{ color }} aria-hidden />
        <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted">{str(props.retention)}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[3px] p-2">
        {range(n).map((i) => (
          <div key={i} className="flex min-h-0 flex-1 items-center gap-1.5">
            <span className="w-5 shrink-0 text-[9px] font-medium text-muted">P{i}</span>
            <div className="flex h-full max-h-4 flex-1 gap-[2px]">
              {range(10).map((j) => (
                <span key={j} className="flex-1 rounded-[2px]" style={{ background: j < 10 - ((i * 3) % 5) - 2 ? tint(color, "66") : "var(--subtle)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Queue({ title, props, color = "#2F6FEB" }: RenderCtx & { color?: string }) {
  const n = Math.min(10, Math.max(1, num(props.messages, 5)));
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex items-center gap-1.5 px-2.5 pt-1.5">
        <Inbox size={14} style={{ color }} aria-hidden />
        <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch gap-1 px-2.5 pb-2 pt-1.5">
        {range(n).map((i) => (
          <span key={i} className="flex-1 rounded-[3px] border" style={{ borderColor: tint(color, "66"), background: tint(color, i < n - 1 ? "22" : "44") }} />
        ))}
        <ArrowDownToLine size={14} className="-rotate-90 self-center text-muted" aria-hidden />
      </div>
    </div>
  );
}

function TableEntity({ title, props }: RenderCtx) {
  const cols = list(props.columns, ["id uuid PK"]);
  const color = "#2F6FEB";
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-line bg-surface text-[11px]">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-white" style={{ background: color }}>
        <Table2 size={13} aria-hidden />
        <span className="truncate text-[12px]">{title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {cols.map((c, i) => {
          const parts = c.trim().split(/\s+/);
          const flag = /^(PK|FK|UK)$/i.test(parts[parts.length - 1] ?? "") ? parts.pop()!.toUpperCase() : "";
          const [name, ...type] = parts;
          return (
            <div key={i} className="flex items-center gap-1.5 border-t border-line px-2.5 py-[3px] first:border-t-0">
              <span className={flag === "PK" ? "font-semibold text-ink" : "text-ink"}>{name}</span>
              <span className="truncate text-muted">{type.join(" ")}</span>
              {flag && (
                <span className="ml-auto shrink-0 rounded px-1 text-[9px] font-bold" style={{ background: flag === "PK" ? "#FFF3C4" : "#E8F0FF", color: flag === "PK" ? "#8A6100" : "#2F6FEB" }}>
                  {flag}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STICKY: Record<string, { color: string; label: string; ink?: string }> = {
  event: { color: "#FFB067", label: "Evento" },
  command: { color: "#8DC8FF", label: "Comando" },
  aggregate: { color: "#FFE680", label: "Agregado" },
  policy: { color: "#D7C2FF", label: "Política" },
  readmodel: { color: "#A6EDB5", label: "Read model" },
  external: { color: "#FFB3CC", label: "Sistema externo" },
  actor: { color: "#FFF3A6", label: "Ator" },
  hotspot: { color: "#FF6B8A", label: "Ponto quente", ink: "#3D0A15" },
};

function sticky(type: keyof typeof STICKY, name: string, keywords: string): ComponentDef {
  const s = STICKY[type];
  return {
    pack: "eventstorming",
    type,
    name,
    keywords,
    size: type === "actor" ? [110, 80] : [150, 120],
    title: type === "event" ? "Pedido realizado" : type === "command" ? "Realizar pedido" : name,
    render: ({ title }) => (
      <div className={`flex h-full w-full flex-col gap-1 p-2.5 shadow-[0_2px_6px_rgba(0,0,0,.14)] ${type === "hotspot" ? "rotate-[-2deg]" : ""}`} style={{ background: s.color, color: s.ink ?? "#1f1f22" }}>
        <span className="text-[9.5px] font-semibold uppercase tracking-[.06em] opacity-60">{s.label}</span>
        <span className="line-clamp-4 text-[13px] font-semibold leading-snug">{title}</span>
      </div>
    ),
  };
}

const C4 = { person: "#08427B", system: "#1168BD", container: "#438DD5", component: "#85BBF0", external: "#8C8C8C" };

function C4Box({ title, kindLabel, desc, color, dark = true, round = 8 }: { title: string; kindLabel: string; desc?: string; color: string; dark?: boolean; round?: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-3 text-center" style={{ background: color, borderRadius: round, color: dark ? "#fff" : "#0b2540" }}>
      <span className="line-clamp-2 text-[14px] font-bold leading-tight">{title}</span>
      <span className="text-[10.5px] opacity-80">[{kindLabel}]</span>
      {desc && <span className="mt-1 line-clamp-3 text-[11px] leading-snug opacity-90">{desc}</span>}
    </div>
  );
}

function FlowShape({ d, title, fill = "var(--surface)", stroke = "var(--ink)" }: { d: string; title: string; fill?: string; stroke?: string }) {
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center px-[14%] text-center text-[13px] font-medium leading-tight text-ink">{title}</span>
    </div>
  );
}

const flow = (type: string, name: string, d: string, keywords: string, size: [number, number] = [160, 80], extra?: { fill?: string }): ComponentDef => ({
  pack: "fluxo",
  type,
  name,
  keywords,
  size,
  title: name,
  render: ({ title }) => <FlowShape d={d} title={title} fill={extra?.fill} />,
});

// Wireframes: grayscale, with the app's neutral tokens.
const wf = "border border-line-2 bg-surface";

function Frame({ title, kind }: { title: string; kind: "browser" | "phone" }) {
  if (kind === "phone") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[22px] border-2 border-ink/70 bg-surface p-1.5">
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-line-2" />
        <div className="flex items-center justify-between px-2 pb-1 text-[10px] text-muted">
          <span>9:41</span>
          <span className="truncate font-semibold text-ink-2">{title}</span>
          <span>●●●</span>
        </div>
        <div className="flex-1 rounded-[14px] bg-surface-2" />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-line-2 bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <span className="size-2 rounded-full bg-[#FF5F57]" />
        <span className="size-2 rounded-full bg-[#FEBC2E]" />
        <span className="size-2 rounded-full bg-[#28C840]" />
        <span className="ml-2 flex-1 truncate rounded bg-surface-2 px-2 py-0.5 text-[10px] text-muted">{title}</span>
      </div>
      <div className="flex-1 bg-surface-2/60" />
    </div>
  );
}

function ux(type: string, name: string, size: [number, number], keywords: string, render: ComponentDef["render"], extra: Partial<ComponentDef> = {}): ComponentDef {
  return { pack: "ux", type, name, keywords, size, title: name, render, ...extra };
}

function prod(type: string, name: string, size: [number, number], keywords: string, render: ComponentDef["render"], extra: Partial<ComponentDef> = {}): ComponentDef {
  return { pack: "produto", type, name, keywords, size, title: name, render, ...extra };
}

// ------------------------------------------------------------------ the catalog

const SYS = "#2F6FEB";

export const COMPONENTS: ComponentDef[] = [
  // Sistemas
  card("sistemas", "user", "Usuário", User, "#5B3FC4", "pessoa cliente ator user"),
  card("sistemas", "browser", "Web app", Monitor, SYS, "navegador site frontend browser spa"),
  card("sistemas", "mobile", "App móvel", Smartphone, SYS, "celular ios android mobile"),
  card("sistemas", "api", "API", Webhook, "#0F6E5C", "rest graphql grpc endpoint"),
  card("sistemas", "service", "Serviço", Server, "#0F6E5C", "microsserviço backend service"),
  card("sistemas", "worker", "Worker", Cog, "#0F6E5C", "job background processamento"),
  card("sistemas", "function", "Função", SquareFunction, "#0F6E5C", "serverless lambda function"),
  card("sistemas", "cache", "Cache", Zap, "#D9363E", "redis memcached memória"),
  card("sistemas", "lb", "Load balancer", Split, "#8C4FFF", "balanceador nginx haproxy"),
  card("sistemas", "gateway", "API Gateway", DoorOpen, "#8C4FFF", "gateway kong borda"),
  card("sistemas", "cdn", "CDN", Globe, "#8C4FFF", "cloudflare cache borda"),
  card("sistemas", "firewall", "Firewall", ShieldCheck, "#DD344C", "waf segurança"),
  card("sistemas", "auth", "Autenticação", KeyRound, "#DD344C", "login oauth sso identidade keycloak"),
  card("sistemas", "scheduler", "Agendador", CalendarClock, "#D9730D", "cron agenda scheduler"),
  card("sistemas", "storage", "Armazenamento", HardDrive, "#7AA116", "arquivos disco blob storage"),
  card("sistemas", "search", "Busca", Search, "#7AA116", "elasticsearch opensearch índice"),
  card("sistemas", "email", "E-mail", Mail, "#D9730D", "smtp ses notificação"),
  card("sistemas", "notification", "Notificações", Bell, "#D9730D", "push sms notificação"),
  card("sistemas", "monitoring", "Monitoramento", Activity, "#5E5F68", "observabilidade métricas logs grafana datadog"),
  card("sistemas", "ai", "Modelo de IA", Brain, "#7C4DDB", "llm ia ml modelo inteligência"),
  {
    ...card("sistemas", "external", "Sistema externo", ExternalLink, "#8C8C8C", "terceiro parceiro externo"),
    render: ({ title, props }) => <Card icon={ExternalLink} color="#8C8C8C" title={title} sub={str(props.sub)} dashed />,
  },

  // EDA e Kafka
  {
    pack: "eda",
    type: "topic",
    name: "Tópico Kafka",
    keywords: "kafka topic tópico partições stream evento",
    size: [220, 128],
    title: "pedidos.criados",
    defaults: { partitions: 3, retention: "7 dias" },
    fields: [
      { key: "partitions", label: "Partições", kind: "number", min: 1, max: 12 },
      { key: "retention", label: "Retenção", kind: "text", placeholder: "Ex.: 7 dias" },
    ],
    render: (c) => <Topic {...c} />,
  },
  {
    pack: "eda",
    type: "queue",
    name: "Fila",
    keywords: "queue fila sqs rabbitmq mensagens",
    size: [200, 72],
    title: "fila-pagamentos",
    defaults: { messages: 5 },
    fields: [{ key: "messages", label: "Mensagens desenhadas", kind: "number", min: 1, max: 10 }],
    render: (c) => <Queue {...c} />,
  },
  {
    pack: "eda",
    type: "dlq",
    name: "Dead letter queue",
    keywords: "dlq erro fila morta retry",
    size: [200, 72],
    title: "pagamentos.dlq",
    defaults: { messages: 3 },
    fields: [{ key: "messages", label: "Mensagens desenhadas", kind: "number", min: 1, max: 10 }],
    render: (c) => <Queue {...c} color="#D9363E" />,
  },
  card("eda", "producer", "Producer", ArrowUpFromLine, "#E37400", "produtor publica evento"),
  card("eda", "consumer", "Consumer", ArrowDownToLine, "#E37400", "consumidor assina evento"),
  {
    pack: "eda",
    type: "group",
    name: "Consumer group",
    keywords: "grupo consumidores instâncias",
    size: [200, 116],
    title: "billing-group",
    defaults: { members: ["consumer-1", "consumer-2", "consumer-3"] },
    fields: [{ key: "members", label: "Consumidores", kind: "list", hint: "Um por linha" }],
    render: ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1 rounded-[10px] border border-dashed bg-surface p-2" style={{ borderColor: "#E37400" }}>
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Users size={13} style={{ color: "#E37400" }} aria-hidden /> {title}
        </span>
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          {list(props.members).slice(0, 6).map((m, i) => (
            <span key={i} className="truncate rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
              {m}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    pack: "eda",
    type: "broker",
    name: "Cluster Kafka",
    keywords: "broker cluster kafka msk confluent",
    size: [220, 96],
    title: "Cluster Kafka",
    defaults: { brokers: 3 },
    fields: [{ key: "brokers", label: "Brokers", kind: "number", min: 1, max: 9 }],
    render: ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Layers size={13} style={{ color: "#E37400" }} aria-hidden /> {title}
        </span>
        <div className="flex min-h-0 flex-1 gap-1.5">
          {range(Math.min(9, Math.max(1, num(props.brokers, 3)))).map((i) => (
            <span key={i} className="flex flex-1 flex-col items-center justify-center rounded-md text-[10px] font-medium" style={{ background: tint("#E37400", "1c"), color: "#B35A00" }}>
              <Server size={13} aria-hidden />B{i + 1}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  card("eda", "schema-registry", "Schema registry", FileJson, "#E37400", "avro protobuf schema contrato"),
  card("eda", "connector", "Connector", Plug, "#E37400", "kafka connect cdc debezium"),
  card("eda", "stream", "Stream processor", Workflow, "#E37400", "kafka streams flink processamento"),
  card("eda", "event-bus", "Event bus", Radio, "#E7157B", "barramento eventos eventbridge"),

  // Event Storming
  sticky("event", "Evento", "evento domínio aconteceu laranja"),
  sticky("command", "Comando", "comando ação azul"),
  sticky("aggregate", "Agregado", "agregado entidade amarelo"),
  sticky("policy", "Política", "política regra quando então lilás"),
  sticky("readmodel", "Read model", "read model visão consulta verde"),
  sticky("external", "Sistema externo", "externo integração rosa"),
  sticky("actor", "Ator", "ator pessoa usuário"),
  sticky("hotspot", "Ponto quente", "hotspot problema dúvida"),

  // Banco de dados
  {
    pack: "dados",
    type: "database",
    name: "Banco de dados",
    keywords: "database banco sql postgres mysql cilindro",
    size: [130, 120],
    title: "pagamentos",
    defaults: { engine: "PostgreSQL" },
    fields: [{ key: "engine", label: "Motor", kind: "select", options: ["PostgreSQL", "MySQL", "SQL Server", "Oracle", "MongoDB", "DynamoDB", "Cassandra", "Redis", "SQLite", "Outro"].map((v) => ({ value: v, label: v })) }],
    render: ({ title, props }) => <Cylinder title={title} sub={str(props.engine)} color={SYS} icon={Database} />,
  },
  {
    pack: "dados",
    type: "table",
    name: "Tabela",
    keywords: "tabela entidade er colunas modelo dados schema",
    size: [220, 150],
    title: "pedidos",
    defaults: { columns: ["id uuid PK", "cliente_id uuid FK", "status text", "total numeric", "criado_em timestamptz"] },
    fields: [{ key: "columns", label: "Colunas", kind: "list", hint: "Uma por linha: nome tipo PK/FK" }],
    render: (c) => <TableEntity {...c} />,
  },
  {
    pack: "dados",
    type: "document-db",
    name: "Banco de documentos",
    keywords: "mongodb documentos nosql",
    size: [130, 120],
    title: "catálogo",
    render: ({ title }) => <Cylinder title={title} sub="Documentos" color="#2B8A3E" icon={FileText} />,
  },
  { pack: "dados", type: "kv", name: "Chave-valor", keywords: "redis dynamodb kv chave valor", size: [130, 120], title: "sessões", render: ({ title }) => <Cylinder title={title} sub="Chave-valor" color="#D9363E" icon={KeyRound} /> },
  { pack: "dados", type: "graph", name: "Banco de grafos", keywords: "neo4j grafo", size: [130, 120], title: "relações", render: ({ title }) => <Cylinder title={title} sub="Grafos" color="#7C4DDB" icon={Share2} /> },
  card("dados", "lake", "Data lake", Waves, "#0F6E5C", "lake dados brutos parquet s3"),
  card("dados", "warehouse", "Data warehouse", Warehouse, "#0F6E5C", "dw bigquery snowflake redshift analytics"),
  card("dados", "etl", "Pipeline (ETL)", Combine, "#0F6E5C", "etl elt airflow dbt pipeline"),
  card("dados", "bucket", "Bucket", Archive, "#7AA116", "objeto s3 gcs blob arquivos"),

  // Cloud (estilo AWS)
  tile("ec2", "Amazon EC2", Cpu, AWS.compute, "servidor vm instância compute"),
  tile("lambda", "AWS Lambda", SquareFunction, AWS.compute, "função serverless"),
  tile("ecs", "Amazon ECS", Container, AWS.compute, "containers docker fargate"),
  tile("eks", "Amazon EKS", Boxes, AWS.compute, "kubernetes k8s"),
  tile("s3", "Amazon S3", Archive, AWS.storage, "bucket objetos armazenamento"),
  tile("efs", "Amazon EFS", HardDrive, AWS.storage, "arquivos disco"),
  tile("rds", "Amazon RDS", Database, AWS.database, "postgres mysql banco relacional"),
  tile("aurora", "Amazon Aurora", Database, AWS.database, "banco relacional"),
  tile("dynamodb", "Amazon DynamoDB", Table2, AWS.database, "nosql chave valor"),
  tile("elasticache", "Amazon ElastiCache", Zap, AWS.database, "redis cache memcached"),
  tile("sqs", "Amazon SQS", Inbox, AWS.integration, "fila queue mensagens"),
  tile("sns", "Amazon SNS", Megaphone, AWS.integration, "notificação pub sub tópico"),
  tile("eventbridge", "Amazon EventBridge", Waypoints, AWS.integration, "eventos barramento bus"),
  tile("stepfunctions", "AWS Step Functions", Workflow, AWS.integration, "orquestração fluxo"),
  tile("apigateway", "Amazon API Gateway", Network, AWS.network, "api gateway rest"),
  tile("cloudfront", "Amazon CloudFront", Globe, AWS.network, "cdn"),
  tile("route53", "Amazon Route 53", Signpost, AWS.network, "dns domínio"),
  tile("elb", "Elastic Load Balancing", Split, AWS.network, "alb nlb balanceador"),
  tile("kinesis", "Amazon Kinesis", Waves, AWS.analytics, "stream dados"),
  tile("msk", "Amazon MSK", Layers, AWS.analytics, "kafka gerenciado"),
  tile("athena", "Amazon Athena", Search, AWS.analytics, "consulta sql s3"),
  tile("glue", "AWS Glue", Combine, AWS.analytics, "etl catálogo"),
  tile("sagemaker", "Amazon SageMaker", Brain, AWS.ml, "machine learning ia modelo"),
  tile("bedrock", "Amazon Bedrock", Brain, AWS.ml, "ia generativa llm"),
  tile("cognito", "Amazon Cognito", Users, AWS.security, "login usuários autenticação"),
  tile("iam", "AWS IAM", KeyRound, AWS.security, "permissões identidade"),
  tile("secrets", "AWS Secrets Manager", Lock, AWS.security, "segredos credenciais"),
  tile("cloudwatch", "Amazon CloudWatch", Gauge, AWS.management, "logs métricas monitoramento"),
  area("aws-cloud", "AWS Cloud", "#232F3E", "nuvem conta área"),
  area("region", "Região", "#147EBA", "region us-east-1 sa-east-1", true),
  area("vpc", "VPC", "#8C4FFF", "rede virtual área"),
  area("subnet-public", "Subnet pública", "#7AA116", "subnet pública rede"),
  area("subnet-private", "Subnet privada", "#147EBA", "subnet privada rede"),

  // C4
  {
    pack: "c4",
    type: "person",
    name: "Pessoa",
    keywords: "c4 pessoa usuário ator",
    size: [170, 170],
    title: "Cliente",
    defaults: { desc: "Compra pelo app ou pelo site." },
    fields: [{ key: "desc", label: "Descrição", kind: "long" }],
    render: ({ title, props }) => (
      <div className="flex h-full w-full flex-col items-center">
        <span className="aspect-square w-[34%] shrink-0 rounded-full" style={{ background: C4.person }} />
        <div className="-mt-[6%] flex w-full flex-1 flex-col items-center justify-center rounded-[28px] px-3 text-center text-white" style={{ background: C4.person }}>
          <span className="text-[14px] font-bold leading-tight">{title}</span>
          <span className="text-[10.5px] opacity-80">[Pessoa]</span>
          {str(props.desc) && <span className="mt-1 line-clamp-2 text-[11px] leading-snug opacity-90">{str(props.desc)}</span>}
        </div>
      </div>
    ),
  },
  {
    pack: "c4",
    type: "system",
    name: "Sistema",
    keywords: "c4 software system",
    size: [220, 130],
    title: "Sistema de pagamentos",
    defaults: { desc: "Processa cobranças e estornos." },
    fields: [{ key: "desc", label: "Descrição", kind: "long" }],
    render: ({ title, props }) => <C4Box title={title} kindLabel="Sistema de software" desc={str(props.desc)} color={C4.system} />,
  },
  {
    pack: "c4",
    type: "external",
    name: "Sistema externo",
    keywords: "c4 externo terceiro",
    size: [220, 130],
    title: "Gateway de cartão",
    fields: [{ key: "desc", label: "Descrição", kind: "long" }],
    render: ({ title, props }) => <C4Box title={title} kindLabel="Sistema externo" desc={str(props.desc)} color={C4.external} />,
  },
  {
    pack: "c4",
    type: "container",
    name: "Container",
    keywords: "c4 container aplicação",
    size: [220, 130],
    title: "API de pagamentos",
    defaults: { tech: "Go", desc: "Expõe as operações de cobrança." },
    fields: [
      { key: "tech", label: "Tecnologia", kind: "text" },
      { key: "desc", label: "Descrição", kind: "long" },
    ],
    render: ({ title, props }) => <C4Box title={title} kindLabel={`Container${str(props.tech) ? `: ${str(props.tech)}` : ""}`} desc={str(props.desc)} color={C4.container} />,
  },
  {
    pack: "c4",
    type: "component",
    name: "Componente",
    keywords: "c4 componente módulo",
    size: [200, 120],
    title: "Validador",
    defaults: { tech: "Go package" },
    fields: [
      { key: "tech", label: "Tecnologia", kind: "text" },
      { key: "desc", label: "Descrição", kind: "long" },
    ],
    render: ({ title, props }) => <C4Box title={title} kindLabel={`Componente${str(props.tech) ? `: ${str(props.tech)}` : ""}`} desc={str(props.desc)} color={C4.component} dark={false} />,
  },
  {
    pack: "c4",
    type: "database",
    name: "Banco (C4)",
    keywords: "c4 banco dados container",
    size: [170, 140],
    title: "Banco de pagamentos",
    defaults: { tech: "PostgreSQL" },
    fields: [{ key: "tech", label: "Tecnologia", kind: "text" }],
    render: ({ title, props }) => (
      <div className="relative h-full w-full">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d="M0 12 L0 88 A50 12 0 0 0 100 88 L100 12" fill={C4.container} />
          <ellipse cx={50} cy={12} rx={50} ry={12} fill="#5EA0E0" />
        </svg>
        <div className="absolute inset-x-2 bottom-[14%] top-[28%] flex flex-col items-center justify-center text-center text-white">
          <span className="text-[13px] font-bold leading-tight">{title}</span>
          <span className="text-[10.5px] opacity-80">[Container{str(props.tech) ? `: ${str(props.tech)}` : ""}]</span>
        </div>
      </div>
    ),
  },

  // Fluxograma
  flow("start", "Início / fim", "M18 1 H82 A17 29 0 0 1 82 59 H18 A17 29 0 0 1 18 1 Z", "início fim terminal começo", [160, 64], { fill: "#E6F6EA" }),
  flow("process", "Processo", "M1 1 H99 V59 H1 Z", "processo etapa ação"),
  flow("decision", "Decisão", "M50 1 L99 30 L50 59 L1 30 Z", "decisão condição se losango", [170, 100], { fill: "#FFF3C4" }),
  flow("document", "Documento", "M1 1 H99 V50 Q75 40 50 50 T1 50 Z", "documento relatório"),
  flow("data", "Dados", "M14 1 H99 L86 59 H1 Z", "dados entrada saída io paralelogramo"),
  flow("delay", "Espera", "M1 1 H70 A29 29 0 0 1 70 59 H1 Z", "espera atraso delay"),
  flow("subprocess", "Subprocesso", "M1 1 H99 V59 H1 Z M10 1 V59 M90 1 V59", "subprocesso predefinido"),
  flow("manual", "Entrada manual", "M1 16 L99 1 V59 H1 Z", "manual digitação"),
  flow("connector", "Conector", "M50 1 A29 29 0 1 1 49.9 1 Z", "conector círculo página", [64, 64]),

  // Telas e wireframes
  ux("browser", "Janela do navegador", [420, 280], "browser site página desktop tela", ({ title }) => <Frame title={title} kind="browser" />, { title: "app.exemplo.com" }),
  ux("phone", "Celular", [200, 380], "mobile celular app tela iphone android", ({ title }) => <Frame title={title} kind="phone" />, { title: "Início" }),
  ux(
    "navbar",
    "Barra de navegação",
    [420, 48],
    "navbar menu topo header",
    ({ title, props }) => (
      <div className={`flex h-full w-full items-center gap-4 rounded-md px-3 ${wf}`}>
        <span className="text-[13px] font-bold text-ink">{title}</span>
        <span className="flex flex-1 gap-3 text-[12px] text-ink-2">
          {list(props.items, ["Início", "Produtos", "Preços"]).map((i) => (
            <span key={i}>{i}</span>
          ))}
        </span>
        <span className="size-6 rounded-full bg-line-2" />
      </div>
    ),
    { title: "Marca", defaults: { items: ["Início", "Produtos", "Preços"] }, fields: [{ key: "items", label: "Itens", kind: "list" }] },
  ),
  ux(
    "button",
    "Botão",
    [128, 40],
    "botão button cta ação",
    ({ title, props }) => {
      const v = str(props.variant, "primary");
      return (
        <div
          className={`flex h-full w-full items-center justify-center rounded-lg px-3 text-[13px] font-semibold ${v === "primary" ? "text-white" : v === "secondary" ? "border border-line-2 bg-surface text-ink" : "text-accent-ink underline"}`}
          style={v === "primary" ? { background: "var(--accent)" } : undefined}
        >
          {title}
        </div>
      );
    },
    {
      title: "Continuar",
      defaults: { variant: "primary" },
      fields: [{ key: "variant", label: "Estilo", kind: "select", options: [{ value: "primary", label: "Principal" }, { value: "secondary", label: "Secundário" }, { value: "link", label: "Link" }] }],
    },
  ),
  ux(
    "input",
    "Campo de texto",
    [240, 64],
    "input campo formulário texto",
    ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-2">{title}</span>
        <span className={`flex flex-1 items-center rounded-md px-2.5 text-[12px] text-muted ${wf}`}>{str(props.placeholder)}</span>
      </div>
    ),
    { title: "E-mail", defaults: { placeholder: "voce@empresa.com" }, fields: [{ key: "placeholder", label: "Texto de exemplo", kind: "text" }] },
  ),
  ux(
    "select",
    "Seleção",
    [240, 64],
    "select dropdown lista opções",
    ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1">
        <span className="text-[11px] font-medium text-ink-2">{title}</span>
        <span className={`flex flex-1 items-center justify-between rounded-md px-2.5 text-[12px] text-ink ${wf}`}>
          {str(props.value)} <span className="text-muted">▾</span>
        </span>
      </div>
    ),
    { title: "Plano", defaults: { value: "Mensal" }, fields: [{ key: "value", label: "Valor", kind: "text" }] },
  ),
  ux(
    "checkbox",
    "Caixa de seleção",
    [200, 28],
    "checkbox marcar opção",
    ({ title, props }) => (
      <div className="flex h-full w-full items-center gap-2 text-[12px] text-ink">
        <span className={`flex size-4 items-center justify-center rounded ${props.checked ? "text-white" : wf}`} style={props.checked ? { background: "var(--accent)" } : undefined}>
          {props.checked ? "✓" : ""}
        </span>
        {title}
      </div>
    ),
    { title: "Lembrar de mim", defaults: { checked: true }, fields: [{ key: "checked", label: "Marcada", kind: "bool" }] },
  ),
  ux(
    "toggle",
    "Interruptor",
    [200, 28],
    "toggle switch liga desliga",
    ({ title, props }) => (
      <div className="flex h-full w-full items-center justify-between gap-2 text-[12px] text-ink">
        {title}
        <span className="relative h-4 w-7 rounded-full" style={{ background: props.on ? "var(--accent)" : "var(--line-2)" }}>
          <span className={`absolute top-0.5 size-3 rounded-full bg-white ${props.on ? "right-0.5" : "left-0.5"}`} />
        </span>
      </div>
    ),
    { title: "Notificações", defaults: { on: true }, fields: [{ key: "on", label: "Ligado", kind: "bool" }] },
  ),
  ux(
    "card",
    "Card",
    [240, 150],
    "card cartão conteúdo",
    ({ title, props }) => (
      <div className={`flex h-full w-full flex-col overflow-hidden rounded-xl ${wf}`}>
        <div className="h-[42%] bg-surface-2" />
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
          <span className="line-clamp-2 text-[11px] text-muted">{str(props.text)}</span>
        </div>
      </div>
    ),
    { title: "Título do card", defaults: { text: "Uma linha de descrição curta." }, fields: [{ key: "text", label: "Texto", kind: "long" }] },
  ),
  ux(
    "modal",
    "Modal",
    [320, 200],
    "modal diálogo janela popup",
    ({ title, props }) => (
      <div className={`flex h-full w-full flex-col rounded-xl p-3 shadow-[0_8px_24px_rgba(0,0,0,.12)] ${wf}`}>
        <span className="flex items-center justify-between text-[14px] font-semibold text-ink">
          {title} <span className="text-muted">×</span>
        </span>
        <span className="mt-1.5 line-clamp-3 flex-1 text-[12px] text-ink-2">{str(props.text)}</span>
        <span className="flex justify-end gap-1.5">
          <span className="rounded-md border border-line-2 px-2 py-1 text-[11px]">Cancelar</span>
          <span className="rounded-md px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "var(--accent)" }}>
            Confirmar
          </span>
        </span>
      </div>
    ),
    { title: "Excluir item?", defaults: { text: "Essa ação não pode ser desfeita." }, fields: [{ key: "text", label: "Texto", kind: "long" }] },
  ),
  ux(
    "table",
    "Tabela",
    [360, 160],
    "tabela grid lista dados",
    ({ props }) => {
      const cols = list(props.columns, ["Nome", "Status", "Valor"]);
      const rows = Math.min(8, Math.max(1, num(props.rows, 4)));
      return (
        <div className={`flex h-full w-full flex-col overflow-hidden rounded-lg text-[11px] ${wf}`}>
          <div className="flex bg-surface-2 font-semibold text-ink-2">
            {cols.map((c) => (
              <span key={c} className="flex-1 truncate px-2 py-1.5">
                {c}
              </span>
            ))}
          </div>
          {range(rows).map((r) => (
            <div key={r} className="flex flex-1 items-center border-t border-line">
              {cols.map((c, i) => (
                <span key={c} className="mx-2 h-1.5 flex-1 rounded-full bg-line" style={{ maxWidth: `${50 + ((r + i) % 3) * 15}%` }} />
              ))}
            </div>
          ))}
        </div>
      );
    },
    { title: "Tabela", defaults: { columns: ["Nome", "Status", "Valor"], rows: 4 }, fields: [{ key: "columns", label: "Colunas", kind: "list" }, { key: "rows", label: "Linhas", kind: "number", min: 1, max: 8 }] },
  ),
  ux(
    "tabs",
    "Abas",
    [320, 40],
    "abas tabs navegação",
    ({ props }) => {
      const items = list(props.items, ["Visão geral", "Atividade", "Ajustes"]);
      return (
        <div className="flex h-full w-full items-end gap-4 border-b border-line-2 px-1 text-[12px]">
          {items.map((t, i) => (
            <span key={t} className={`pb-1.5 ${i === 0 ? "border-b-2 font-semibold text-ink" : "text-muted"}`} style={i === 0 ? { borderColor: "var(--accent)" } : undefined}>
              {t}
            </span>
          ))}
        </div>
      );
    },
    { title: "Abas", defaults: { items: ["Visão geral", "Atividade", "Ajustes"] }, fields: [{ key: "items", label: "Abas", kind: "list" }] },
  ),
  ux(
    "list",
    "Lista",
    [260, 150],
    "lista itens linhas",
    ({ props }) => (
      <div className={`flex h-full w-full flex-col overflow-hidden rounded-lg ${wf}`}>
        {list(props.items, ["Item um", "Item dois", "Item três"]).map((t) => (
          <span key={t} className="flex flex-1 items-center gap-2 border-t border-line px-2.5 text-[12px] text-ink first:border-t-0">
            <span className="size-5 shrink-0 rounded-md bg-surface-2" />
            {t}
          </span>
        ))}
      </div>
    ),
    { title: "Lista", defaults: { items: ["Item um", "Item dois", "Item três"] }, fields: [{ key: "items", label: "Itens", kind: "list" }] },
  ),
  ux(
    "search",
    "Busca",
    [260, 40],
    "busca pesquisa search barra",
    ({ title }) => (
      <div className={`flex h-full w-full items-center gap-2 rounded-full px-3 text-[12px] text-muted ${wf}`}>
        <Search size={13} aria-hidden /> {title}
      </div>
    ),
    { title: "Buscar…" },
  ),
  ux(
    "avatar",
    "Avatar",
    [56, 56],
    "avatar foto perfil usuário",
    ({ title }) => (
      <div className="flex h-full w-full items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent-ink">
        {title.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </div>
    ),
    { title: "Ana Lima" },
  ),
  ux(
    "image",
    "Imagem (espaço)",
    [200, 130],
    "imagem foto placeholder",
    () => (
      <div className={`relative h-full w-full overflow-hidden rounded-lg ${wf}`}>
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
          <path d="M0 0 L100 100 M100 0 L0 100" stroke="var(--line-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    ),
    { title: "Imagem" },
  ),
  ux(
    "chart",
    "Gráfico",
    [260, 150],
    "gráfico chart barras dashboard",
    ({ title, props }) => {
      const bars = list(props.values, ["4", "7", "5", "9", "6", "8"]).map((v) => Number(v) || 0);
      const max = Math.max(1, ...bars);
      return (
        <div className={`flex h-full w-full flex-col gap-1.5 rounded-lg p-2.5 ${wf}`}>
          <span className="truncate text-[12px] font-semibold text-ink">{title}</span>
          <div className="flex min-h-0 flex-1 items-end gap-1.5">
            {bars.map((b, i) => (
              <span key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${(b / max) * 100}%`, background: i === bars.length - 1 ? "var(--accent)" : "var(--line-2)" }} />
            ))}
          </div>
        </div>
      );
    },
    { title: "Vendas por mês", defaults: { values: ["4", "7", "5", "9", "6", "8"] }, fields: [{ key: "values", label: "Valores", kind: "list", hint: "Um número por linha" }] },
  ),

  // Produto
  prod(
    "persona",
    "Persona",
    [240, 170],
    "persona usuário perfil público",
    ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
        <span className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">{title.slice(0, 1).toUpperCase()}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
            <span className="truncate text-[11px] text-muted">{str(props.role)}</span>
          </span>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted">Objetivos</span>
        {list(props.goals).slice(0, 4).map((g) => (
          <span key={g} className="truncate text-[11.5px] text-ink-2">
            • {g}
          </span>
        ))}
      </div>
    ),
    {
      title: "Marina, gestora financeira",
      defaults: { role: "Fecha o caixa todo dia", goals: ["Ver pendências num lugar só", "Conciliar em minutos"] },
      fields: [
        { key: "role", label: "Contexto", kind: "text" },
        { key: "goals", label: "Objetivos", kind: "list" },
      ],
    },
  ),
  prod(
    "story",
    "História de usuário",
    [260, 130],
    "história user story requisito backlog",
    ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1 rounded-xl border-l-4 bg-surface p-2.5 shadow-[0_1px_3px_rgba(0,0,0,.08)]" style={{ borderColor: "#2F6FEB" }}>
        <span className="truncate text-[12px] font-semibold text-ink">{title}</span>
        <span className="text-[11.5px] leading-snug text-ink-2">
          <b className="font-semibold">Como</b> {str(props.who)}, <b className="font-semibold">quero</b> {str(props.what)}, <b className="font-semibold">para</b> {str(props.why)}.
        </span>
      </div>
    ),
    {
      title: "Pagar com Pix",
      defaults: { who: "cliente", what: "pagar com Pix", why: "concluir a compra na hora" },
      fields: [
        { key: "who", label: "Como (quem)", kind: "text" },
        { key: "what", label: "Quero (o quê)", kind: "text" },
        { key: "why", label: "Para (por quê)", kind: "text" },
      ],
    },
  ),
  prod(
    "okr",
    "OKR",
    [260, 150],
    "okr objetivo resultados chave meta",
    ({ title, props }) => (
      <div className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <Flag size={13} className="text-accent-ink" aria-hidden /> {title}
        </span>
        {list(props.krs).slice(0, 4).map((k, i) => (
          <span key={k} className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full" style={{ width: `${30 + ((i * 23) % 60)}%`, background: "var(--accent)" }} />
            </span>
            <span className="truncate">{k}</span>
          </span>
        ))}
      </div>
    ),
    { title: "Pagamentos sem atrito", defaults: { krs: ["Conversão no checkout 72% → 80%", "Tempo de pagamento < 30 s", "Estornos −20%"] }, fields: [{ key: "krs", label: "Resultados-chave", kind: "list" }] },
  ),
  prod(
    "metric",
    "Métrica",
    [180, 96],
    "métrica kpi indicador número",
    ({ title, props }) => {
      const delta = str(props.delta);
      const up = !delta.trim().startsWith("-") && !delta.trim().startsWith("−");
      return (
        <div className="flex h-full w-full flex-col justify-center rounded-xl border border-line bg-surface px-3">
          <span className="truncate text-[11px] text-muted">{title}</span>
          <span className="text-[24px] font-semibold leading-tight tracking-[-.02em] text-ink">{str(props.value)}</span>
          {delta && <span className={`text-[11px] font-medium ${up ? "text-success-ink" : "text-danger"}`}>{delta}</span>}
        </div>
      );
    },
    { title: "Conversão", defaults: { value: "74,2%", delta: "+3,1 pp" }, fields: [{ key: "value", label: "Valor", kind: "text" }, { key: "delta", label: "Variação", kind: "text" }] },
  ),
  prod(
    "matrix",
    "Matriz 2×2",
    [320, 280],
    "matriz 2x2 prioridade impacto esforço quadrantes",
    ({ props }) => {
      const q = list(props.quadrants, ["Fazer já", "Planejar", "Delegar", "Descartar"]);
      return (
        <div className="relative grid h-full w-full grid-cols-2 grid-rows-2 gap-1 rounded-lg border border-line bg-surface p-1 pb-5 pl-5">
          {q.slice(0, 4).map((t, i) => (
            <span key={i} className="flex items-start rounded-md p-1.5 text-[11.5px] font-semibold text-ink-2" style={{ background: ["#E6F6EA", "#E8F0FF", "#FFF1E3", "#F3F3F1"][i] }}>
              {t}
            </span>
          ))}
          <span className="absolute bottom-0.5 left-5 right-1 text-center text-[10px] text-muted">{str(props.x)} →</span>
          <span className="absolute bottom-5 left-0.5 top-1 flex items-center text-[10px] text-muted [writing-mode:vertical-rl] rotate-180">{str(props.y)} →</span>
        </div>
      );
    },
    {
      title: "Prioridades",
      defaults: { x: "Esforço", y: "Impacto", quadrants: ["Fazer já", "Planejar", "Delegar", "Descartar"] },
      fields: [
        { key: "x", label: "Eixo horizontal", kind: "text" },
        { key: "y", label: "Eixo vertical", kind: "text" },
        { key: "quadrants", label: "Quadrantes", kind: "list", hint: "Quatro linhas" },
      ],
    },
  ),
  prod(
    "milestone",
    "Marco",
    [180, 64],
    "marco milestone entrega data lançamento",
    ({ title, props }) => (
      <div className="flex h-full w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF1E3] text-[#D9730D]">
          <Flag size={16} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
          <span className="truncate text-[11px] text-muted">{str(props.date)}</span>
        </span>
      </div>
    ),
    { title: "Lançamento beta", defaults: { date: "Março 2027" }, fields: [{ key: "date", label: "Quando", kind: "text" }] },
  ),
  prod(
    "release",
    "Entrega",
    [200, 64],
    "release versão entrega pacote",
    ({ title, props }) => <Card icon={PackageOpen} color="#2B8A3E" title={title} sub={str(props.sub)} />,
    { title: "v2.4", defaults: { sub: "Checkout com Pix" }, fields: [{ key: "sub", label: "O que entra", kind: "text" }] },
  ),
  prod(
    "cloud-idea",
    "Ideia",
    [200, 120],
    "ideia brainstorm nuvem",
    ({ title }) => (
      <div className="flex h-full w-full items-center justify-center rounded-[40%] border border-dashed border-line-2 bg-surface p-4 text-center text-[13px] font-medium text-ink">
        <Cloud size={14} className="mr-1.5 shrink-0 text-muted" aria-hidden /> {title}
      </div>
    ),
    { title: "E se o cliente pagar em 1 clique?" },
  ),
];

const BY_KEY = new Map(COMPONENTS.map((c) => [`${c.pack}/${c.type}`, c]));

export function componentDef(pack: string, type: string): ComponentDef | undefined {
  return BY_KEY.get(`${pack}/${type}`);
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Components matching a search (name, pack and keywords), best first. */
export function searchComponents(q: string): ComponentDef[] {
  const t = fold(q.trim());
  if (!t) return COMPONENTS;
  const pack = new Map<string, string>(PACKS.map((p) => [p.id, fold(p.name)]));
  return COMPONENTS.map((c) => {
    const name = fold(c.name);
    const hay = `${name} ${fold(c.keywords ?? "")} ${pack.get(c.pack)}`;
    const score = name === t ? 100 : name.startsWith(t) ? 70 : name.includes(t) ? 50 : hay.includes(t) ? 30 : t.split(/\s+/).every((w) => hay.includes(w)) ? 20 : 0;
    return { c, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
