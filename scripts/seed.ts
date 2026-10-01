/**
 * Demo data: `npm run db:seed`
 * Creates demo@waypoint.local / waypoint123 with sample plans and links.
 * Safe to re-run: does nothing if the demo user already exists.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/server/db";
import { createUser } from "../src/server/services/workspaces";
import { createCollection, createFavorite, toggleMark } from "../src/server/services/links";
import { createPlan, publishPlan, saveDraft, getDraft } from "../src/server/services/plans";
import type { PlanDocument, PlanEdge, PlanNode } from "../src/domain/plan";

const EMAIL = "demo@waypoint.local";

async function main() {
  const db = getDb();
  if (db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).get()) {
    console.log("Demo já existe — nada a fazer.");
    return;
  }
  const userId = await createUser({ email: EMAIL, name: "Demo", password: "waypoint123" });
  const ws = db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, userId)).get()!.workspaceId;

  // ------------------------------------------------------------ links
  const col = (name: string, parentId?: string, extra: { description?: string; color?: string } = {}) =>
    createCollection({ workspaceId: ws, userId, name, parentId, ...extra });
  const dev = col("Development", undefined, { color: "#E8EDFF", description: "Ferramentas e referências de engenharia." });
  const frontend = col("Frontend", dev);
  const react = col("React", frontend);
  const canvas = col("Canvas & Diagramas", frontend, { description: "Bibliotecas e referências para construir editores visuais." });
  const backend = col("Backend", dev, { description: "Serviços, dados e integrações." });
  const devops = col("DevOps", dev);
  const arch = col("Architecture", undefined, { color: "#EFE9FF", description: "Padrões, decisões e referências de arquitetura." });
  const eda = col("EDA", arch, { description: "Event-driven architecture." });
  const payments = col("Pagamentos", arch, { description: "Referências do domínio de pagamentos." });
  const ai = col("AI", undefined, { color: "#FFEADB" });
  const research = col("Research", undefined, { color: "#DDF4EE" });

  const fav = (collectionId: string, url: string, title: string, description: string, tags: string[], extra: Partial<Parameters<typeof createFavorite>[2]> = {}) =>
    createFavorite(ws, userId, { url, title, description, tags, collectionId, ...extra });

  fav(canvas, "https://reactflow.dev", "React Flow", "Biblioteca para construir editores baseados em nós, fluxos e diagramas interativos.", ["react", "canvas", "docs"], { openBehavior: "preview" });
  fav(canvas, "https://tldraw.dev", "tldraw", "SDK de whiteboard infinito para React, com ferramentas e colaboração.", ["canvas", "oss"]);
  fav(canvas, "https://excalidraw.com", "Excalidraw", "Quadro branco colaborativo com traço de esboço desenhado à mão.", ["canvas", "oss"]);
  fav(canvas, "https://github.com/kieler/elkjs", "ELK.js", "Algoritmos de auto layout para grafos — base para organizar nós automaticamente.", ["layout", "oss"]);
  fav(canvas, "https://floating-ui.com", "Floating UI", "Posicionamento de popovers, tooltips e menus de contexto.", ["react", "ui"]);
  fav(canvas, "https://dndkit.com", "dnd kit", "Toolkit leve e acessível de drag and drop para React.", ["react", "dnd"]);
  fav(react, "https://react.dev", "React", "Documentação oficial do React.", ["react", "docs"]);
  fav(react, "https://nextjs.org/docs", "Next.js Docs", "Documentação do Next.js (App Router).", ["react", "docs"]);
  fav(backend, "https://orm.drizzle.team", "Drizzle ORM", "ORM TypeScript leve com SQL de verdade.", ["typescript", "database"]);
  fav(backend, "https://www.sqlite.org/fts5.html", "SQLite FTS5", "Full-text search nativo do SQLite.", ["database", "busca"]);
  fav(devops, "https://opentelemetry.io", "OpenTelemetry", "Padrão aberto de traces, métricas e logs.", ["observabilidade"]);
  fav(devops, "https://grafana.com/docs", "Grafana Docs", "Dashboards e alertas.", ["observabilidade"]);
  fav(arch, "https://adr.github.io", "Architecture Decision Records", "Como registrar decisões de arquitetura.", ["arquitetura", "docs"]);
  fav(eda, "https://kafka.apache.org/documentation/", "Kafka Documentation", "Documentação oficial do Apache Kafka.", ["kafka", "eda"]);
  fav(eda, "https://docs.confluent.io", "Confluent Documentation", "Plataforma Confluent e Kafka gerenciado.", ["kafka", "eda"]);
  fav(eda, "https://developer.confluent.io/patterns/", "Event Streaming Patterns", "Catálogo de padrões de event streaming.", ["kafka", "eda", "arquitetura"]);
  const kong = fav(payments, "https://docs.konghq.com", "Kong Gateway Docs", "API gateway: autenticação, rate limiting e roteamento.", ["gateway", "backend"]);
  fav(payments, "https://www.bcb.gov.br/estabilidadefinanceira/pix", "Pix — Banco Central", "Regulamento e documentação do Pix.", ["pagamentos", "pix"]);
  fav(ai, "https://docs.anthropic.com", "Claude Docs", "Documentação da API do Claude.", ["ia", "docs"]);
  fav(ai, "https://modelcontextprotocol.io", "Model Context Protocol", "Protocolo aberto para conectar modelos a ferramentas e dados.", ["ia", "agents"]);
  fav(research, "https://arxiv.org", "arXiv", "Preprints de pesquisa.", ["pesquisa"]);

  toggleMark(userId, "collection", dev, "pin");
  toggleMark(userId, "collection", arch, "pin");
  toggleMark(userId, "collection", ai, "pin");
  toggleMark(userId, "collection", research, "pin");

  // ------------------------------------------------------------ plans
  const n = (id: string, kind: PlanNode["kind"], x: number, y: number, width: number, height: number, data: PlanNode["data"], parentId?: string): PlanNode => ({
    id,
    kind,
    x,
    y,
    width,
    height,
    parentId,
    data,
  });
  const e = (id: string, source: string, target: string, kind: PlanEdge["kind"] = "flow", label?: string): PlanEdge => ({ id, source, target, kind, label });

  const acq: PlanDocument = {
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      n("note", "note", 48, 40, 220, 92, { title: "Atenção", description: "Dependência do fornecedor X no POS — validar SLA." }),
      n("app", "block", 356, 56, 180, 64, { title: "APP", description: "iOS · Android", icon: "smartphone", color: "#E8EDFF", status: "production" }),
      n("gw", "block", 346, 176, 200, 72, {
        title: "API Gateway",
        description: "Entrada única para apps e parceiros. Autenticação, rate limit e roteamento.",
        icon: "shield",
        color: "#EFE9FF",
        status: "production",
        tags: ["gateway", "backend", "segurança"],
        resource: { type: "favorite", id: kong },
        openIn: "new-tab",
      }),
      n("docs", "link", 48, 172, 220, 80, { title: "Kong Gateway Docs", resource: { type: "favorite", id: kong }, openIn: "modal" }),
      n("clientes", "block", 48, 340, 180, 72, { title: "Clientes", description: "Cadastro · KYC", icon: "users", color: "#DDF4EE", resource: { type: "collection", id: backend }, openIn: "new-tab" }),
      n("pag", "container", 276, 316, 340, 196, { title: "Pagamentos", color: "#FFEADB", resource: { type: "collection", id: payments }, openIn: "new-tab" }),
      n("pix", "block", 20, 48, 92, 60, { title: "PIX", description: "instantâneo" }, "pag"),
      n("boleto", "block", 124, 48, 92, 60, { title: "Boleto", description: "registro" }, "pag"),
      n("cartao", "block", 228, 48, 92, 60, { title: "Cartão", description: "crédito · débito" }, "pag"),
      n("pos", "block", 664, 340, 180, 72, { title: "POS", description: "Terminais · TEF", icon: "terminal", color: "#DDF4EE", status: "in-progress" }),
      n("core", "block", 326, 620, 240, 72, { title: "Serviços Core", description: "Ledger · liquidação · antifraude", icon: "server", color: "#17171C", tags: ["kafka"] }),
    ],
    edges: [
      e("e1", "app", "gw", "flow", "REST"),
      e("e2", "gw", "docs", "dependency"),
      e("e3", "gw", "clientes"),
      e("e4", "gw", "pag"),
      e("e5", "gw", "pos"),
      e("e6", "clientes", "core", "relation"),
      e("e7", "pag", "core", "flow", "eventos · Kafka"),
      e("e8", "pos", "core", "relation"),
    ],
  };
  const acqId = createPlan({
    workspaceId: ws,
    userId,
    title: "Ecossistema Adquirência",
    description: "Mapa de referência dos sistemas de adquirência — da entrada pelo app até os serviços core. Clique em um bloco para abrir sua documentação.",
    document: acq,
    tags: ["arquitetura", "pagamentos"],
  });
  publishPlan(acqId, userId);

  const payArch: PlanDocument = {
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      n("producers", "section", 0, 0, 260, 240, { title: "Produtores" }),
      n("orders", "block", 24, 48, 212, 64, { title: "Pedidos", icon: "card" }, "producers"),
      n("auth", "block", 24, 136, 212, 64, { title: "Autorização", icon: "shield" }, "producers"),
      n("kafka", "block", 360, 80, 220, 80, { title: "Kafka", description: "Event Streaming", icon: "workflow", color: "#17171C", tags: ["kafka", "eda"], resource: { type: "collection", id: eda }, openIn: "new-tab" }),
      n("consumers", "section", 680, 0, 260, 240, { title: "Consumidores" }),
      n("ledger", "block", 24, 48, 212, 64, { title: "Ledger", icon: "database" }, "consumers"),
      n("fraud", "block", 24, 136, 212, 64, { title: "Antifraude", icon: "shield" }, "consumers"),
    ],
    edges: [e("p1", "orders", "kafka"), e("p2", "auth", "kafka"), e("p3", "kafka", "ledger", "flow", "event"), e("p4", "kafka", "fraud", "flow", "event")],
  };
  const payId = createPlan({ workspaceId: ws, userId, title: "Arquitetura Pagamentos", description: "Fluxo de eventos entre produtores e consumidores.", document: payArch, tags: ["kafka", "eda"] });
  publishPlan(payId, userId);

  const roadmap: PlanDocument = {
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      n("q1", "section", 0, 0, 280, 300, { title: "Q1 2027" }),
      n("q2", "section", 320, 0, 280, 300, { title: "Q2 2027" }),
      n("q3", "section", 640, 0, 280, 300, { title: "Q3 2027" }),
      n("r1", "block", 24, 52, 232, 64, { title: "Novo checkout", status: "planned", color: "#E8EDFF" }, "q1"),
      n("r2", "block", 24, 136, 232, 64, { title: "Observabilidade", status: "idea", color: "#DDF4EE" }, "q1"),
      n("r3", "block", 24, 52, 232, 64, { title: "Pix por aproximação", status: "planned", color: "#FFEADB" }, "q2"),
      n("r4", "block", 24, 52, 232, 64, { title: "Assistente com IA", status: "idea", color: "#EFE9FF" }, "q3"),
    ],
    edges: [e("r12", "r1", "r3", "dependency")],
  };
  const roadmapId = createPlan({ workspaceId: ws, userId, title: "Roadmap 2027", description: "Iniciativas por trimestre.", document: roadmap, tags: ["roadmap"] });
  // leave Roadmap as a draft; touch it so it's "recent"
  saveDraft(roadmapId, userId, getDraft(roadmapId).version, roadmap);

  createPlan({
    workspaceId: ws,
    userId,
    title: "Template — Serviço",
    description: "Ponto de partida para documentar um serviço: dependências, dados e referências.",
    isTemplate: true,
    document: {
      schemaVersion: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        n("svc", "block", 260, 120, 220, 72, { title: "Serviço", icon: "server", color: "#E8EDFF" }),
        n("db", "block", 260, 280, 220, 72, { title: "Banco de dados", icon: "database" }),
        n("up", "block", 0, 120, 200, 72, { title: "Dependência" }),
        n("docs", "link", 540, 120, 220, 72, { title: "Documentação" }),
        n("note", "note", 540, 260, 220, 92, { title: "Notas", description: "Decisões, riscos e pendências." }),
      ],
      edges: [e("t1", "up", "svc"), e("t2", "svc", "db"), e("t3", "svc", "docs", "dependency")],
    },
  });

  console.log(`Demo criada: ${EMAIL} / waypoint123`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
