/**
 * SSR smoke tests: the planner surfaces render on the server without
 * crashing (catches hook misuse / undefined access in render paths).
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { PlanDocument } from "@/domain/plan";

process.env.DATABASE_PATH = ":memory:";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/plans/p1",
  useSearchParams: () => new URLSearchParams(),
}));

const doc: PlanDocument = {
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: "pay", kind: "container", x: 276, y: 316, width: 340, height: 196, data: { title: "Pagamentos", color: "#FFEADB" } },
    { id: "pix", kind: "block", x: 20, y: 48, width: 92, height: 60, parentId: "pay", data: { title: "PIX", status: "production", icon: "zap" } },
    { id: "gw", kind: "block", x: 346, y: 176, width: 200, height: 72, data: { title: "API Gateway", icon: "shield", color: "#EFE9FF", tags: ["gateway"], resource: { type: "url", url: "https://example.com" }, openIn: "modal" } },
    { id: "core", kind: "block", x: 326, y: 620, width: 240, height: 72, data: { title: "Serviços Core", color: "#17171C" } },
    { id: "note", kind: "note", x: 48, y: 40, width: 220, height: 92, data: { title: "Atenção", description: "Validar SLA" } },
    { id: "lnk", kind: "link", x: 48, y: 172, width: 220, height: 80, data: { title: "", resource: { type: "favorite", id: "f1" } } },
    { id: "sec", kind: "section", x: 900, y: 0, width: 400, height: 300, data: { title: "Fase 1", collapsed: true } },
    { id: "img", kind: "image", x: 900, y: 400, width: 200, height: 150, data: { title: "Diagrama", image: "/api/assets/x" } },
    { id: "txt", kind: "text", x: 900, y: 600, width: 240, height: 44, data: { title: "Roadmap" } },
  ],
  edges: [
    { id: "e1", source: "gw", target: "pix", kind: "flow", label: "REST" },
    { id: "e2", source: "note", target: "gw", kind: "dependency" },
    { id: "e3", source: "pay", target: "core", kind: "strong" },
    { id: "e4", source: "lnk", target: "gw", kind: "relation" },
  ],
};

const resources = {
  lnk: { kind: "favorite" as const, title: "ACI Documentation", subtitle: "Favorito · aci.dev", href: "https://aci.dev", external: true },
};

describe("planner SSR", () => {
  it.each(["edit", "view"] as const)("renders every node kind (%s mode)", async (mode) => {
    const { ReactFlow } = await import("@xyflow/react");
    const { nodeTypes } = await import("./nodes");
    const { edgeTypes } = await import("./edges");
    const { PlannerContext } = await import("./context");
    const { toFlowEdges, toFlowNodes } = await import("@/domain/canvas-adapter");
    const ctx = {
      mode,
      resourceFor: (n: { id: string }) => (n.id === "lnk" ? resources.lnk : null),
      editingId: mode === "edit" ? "gw" : null,
      setEditingId: () => {},
      commitTitle: () => {},
      toggleCollapsed: () => {},
      childCount: () => 2,
      singleSelectedId: "gw",
      highlightId: null,
      dropTargetId: null,
      connectSourceId: null,
      isInteractive: () => true,
    };
    const html = renderToString(
      createElement(
        PlannerContext.Provider,
        { value: ctx },
        createElement(ReactFlow, {
          nodes: toFlowNodes(doc, { selected: new Set(["gw"]), readOnly: mode === "view" }),
          edges: toFlowEdges(doc),
          nodeTypes,
          edgeTypes,
          width: 1600,
          height: 900,
          fitView: true,
        }),
      ),
    );
    for (const t of ["Pagamentos", "PIX", "Serviços Core", "Atenção", "ACI Documentation", "Fase 1", "Diagrama", "Roadmap"]) expect(html).toContain(t);
    if (mode === "edit") expect(html).toContain('value="API Gateway"');
    else expect(html).toContain("API Gateway");
  });

  it("renders the public / view mode page", async () => {
    const { PublicPlanView } = await import("./public-plan-view");
    const html = renderToString(
      createElement(PublicPlanView, { plan: { id: "p1", title: "Ecossistema Adquirência", description: "Mapa de referência", tags: ["arquitetura"] }, document: doc, resources }),
    );
    expect(html).toContain("Ecossistema Adquirência");
    expect(html).toContain("Referências");
    expect(html).toContain("ACI Documentation");
    expect(html).not.toContain("Compartilhar");
  });

  it("renders the editor", async () => {
    const { PlanEditor } = await import("./editor");
    const { TooltipProvider } = await import("@/components/ui/popover");
    const html = renderToString(
      createElement(
        TooltipProvider,
        null,
        createElement(PlanEditor, {
          plan: { id: "p1", title: "Ecossistema", description: null, tags: [], visibility: "workspace" },
          workspaceName: "Pessoal",
          initial: { document: doc, version: 3, updatedAt: Date.now() },
          published: { version: 2 },
          unpublished: true,
          resources: { "favorite:f1": resources.lnk },
          people: [{ name: "Thiago Lima", email: "t@x.dev" }],
        }),
      ),
    );
    expect(html).toContain("Elementos");
    expect(html).toContain("Camadas");
    expect(html).toContain("Publicar");
    expect(html).toContain("Não publicado");
  });

  it("renders the inspector for nodes, edges and multi-selection", async () => {
    const { Inspector } = await import("./inspector");
    const { SelectionBar } = await import("./canvas-controls");
    const { EditorContext } = await import("./editor-context");
    const { TooltipProvider } = await import("@/components/ui/popover");
    const { toFlowEdges, toFlowNodes } = await import("@/domain/canvas-adapter");
    const { DEFAULT_STYLE } = await import("./shape-geometry");
    const nodes = toFlowNodes(doc);
    const edges = toFlowEdges(doc);
    const noop = () => {};
    const base = {
      planId: "p1",
      nodes,
      edges,
      meta: { title: "Plan", description: null, tags: ["a"], visibility: "link" },
      tool: "select",
      ink: { mode: "pen", color: undefined, size: 4 },
      style: DEFAULT_STYLE,
      layers: {
        list: [
          { id: "base", name: "Base", visible: true },
          { id: "p", name: "Proposta", visible: true, color: "#E5484D" },
        ],
        views: [],
        active: "base",
        counts: new Map(),
        isolated: null,
      },
      connectKind: "flow",
      grid: true,
      snap: false,
      resourceFor: (n: { id: string }) => (n.id === "lnk" ? resources.lnk : null),
      hasClipboard: () => false,
    };
    const api = (over: Record<string, unknown>) =>
      new Proxy({ ...base, ...over }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) }) as never;
    const render = (over: Record<string, unknown>) =>
      renderToString(createElement(TooltipProvider, null, createElement(EditorContext.Provider, { value: api(over) }, createElement(Inspector), createElement(SelectionBar))));

    for (const n of nodes) {
      for (const tab of ["content", "appearance", "action"]) {
        const html = render({ selectedNodes: [n], selectedEdges: [], inspectorTab: tab });
        expect(html).toContain("Conteúdo");
      }
    }
    expect(render({ selectedNodes: [], selectedEdges: [edges[0]] })).toContain("Inverter direção");
    expect(render({ selectedNodes: [], selectedEdges: edges })).toContain("4 conexões");
    expect(render({ selectedNodes: nodes.slice(0, 3), selectedEdges: [] })).toContain("Agrupar");
    expect(render({ selectedNodes: [], selectedEdges: [] })).toContain("Qualquer pessoa com o link");
    expect(render({ selectedNodes: [], selectedEdges: [], tool: "connect" })).toContain("Clique na origem");
    // layers: the selection's layer, drawing tools and a drawn stroke
    expect(render({ selectedNodes: nodes.slice(0, 1), selectedEdges: [], inspectorTab: "appearance" })).toContain("Proposta");
    expect(render({ selectedNodes: [], selectedEdges: [], tool: "draw" })).toContain("Marca-texto");
    expect(render({ selectedNodes: [], selectedEdges: [], tool: "erase" })).toContain("Passe sobre os traços");
    const [ink] = toFlowNodes({ nodes: [{ id: "ink1", kind: "ink", x: 0, y: 0, width: 40, height: 20, data: { title: "", ink: { points: [2, 2, 38, 18], w: 40, h: 20, size: 2, arrow: true } } }] });
    expect(render({ selectedNodes: [ink], selectedEdges: [] })).toContain("Apagar desenho");
    // shapes and text in the drawing bar; a text annotation and a numbered connection
    expect(render({ selectedNodes: [], selectedEdges: [], tool: "rect" })).toContain("Arraste para desenhar");
    expect(render({ selectedNodes: [], selectedEdges: [], tool: "arrow" })).toContain("Ponta final");
    const [shape] = toFlowNodes({ nodes: [{ id: "s1", kind: "shape", x: 0, y: 0, width: 120, height: 80, data: { title: "Fila", shape: { type: "diamond", fill: "#A5D8FF", roughness: 1 } } }] });
    const shapeHtml = render({ selectedNodes: [shape], selectedEdges: [] });
    expect(shapeHtml).toContain("Losango");
    expect(shapeHtml).toContain("Preenchimento");
    expect(shapeHtml).toContain("Traçado");
    const [note] = toFlowNodes({ nodes: [{ id: "t1", kind: "ink", x: 0, y: 0, width: 80, height: 30, data: { title: "Olhe aqui", ink: { points: [0, 0, 80, 30], w: 80, h: 30, size: 4, shape: "text" } } }] });
    const textHtml = render({ selectedNodes: [note], selectedEdges: [] });
    expect(textHtml).toContain("Texto à mão");
    expect(textHtml).toContain("Olhe aqui");
    const [stepEdge] = toFlowEdges({ edges: [{ ...doc.edges[0], step: 3 }] });
    const edgeHtml = render({ selectedNodes: [], selectedEdges: [stepEdge] });
    expect(edgeHtml).toContain("Passo do fluxo");
    expect(edgeHtml).toContain('value="3"');
  });

  it("renders the layers panel and the comparison bar", async () => {
    const { LayersPanel } = await import("./layers-panel");
    const { CompareBar, ViewLayers } = await import("./view-layers");
    const { EditorContext } = await import("./editor-context");
    const { TooltipProvider } = await import("@/components/ui/popover");
    const layers = [
      { id: "base", name: "Atual", visible: true },
      { id: "p", name: "Proposta", visible: true, color: "#E5484D", opacity: 0.6, reveal: true },
    ];
    const views = [
      { id: "v1", name: "Hoje", layers: ["base"] },
      { id: "v2", name: "Com a proposta", layers: ["base", "p"] },
    ];
    const noop = () => {};
    const api = new Proxy(
      { layers: { list: layers, views, active: "p", counts: new Map([["p", 2]]), isolated: null }, selectedNodes: [], selectedEdges: [], nodes: [], edges: [] },
      { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop) },
    ) as never;
    const panel = renderToString(createElement(TooltipProvider, null, createElement(EditorContext.Provider, { value: api }, createElement(LayersPanel))));
    expect(panel).toContain("Proposta");
    expect(panel).toContain("60%");
    expect(panel).toContain("Modelos de camadas");
    const d = { layers, views };
    expect(renderToString(createElement(TooltipProvider, null, createElement(ViewLayers, { doc: d, overrides: {}, onChange: noop, onCompare: noop })))).toContain("Camadas");
    const bar = renderToString(createElement(CompareBar, { doc: d, value: { a: "v:v1", b: "v:v2", show: "diff" }, counts: { added: 2, removed: 0, changed: 1 }, onChange: noop, onClose: noop }));
    expect(bar).toContain("Diferença");
    expect(bar).toContain("Com a proposta");
    expect(bar).toContain("+<!-- -->2");
  });

  it("renders the plans list", async () => {
    const { PlansList } = await import("./plans-list");
    const html = renderToString(
      createElement(PlansList, {
        filter: "mine",
        canCreate: true,
        plans: [
          { id: "p1", title: "Roadmap 2027", description: null, updatedAt: Date.now(), publishedVersion: 1, access: "owner", isTemplate: false, archived: false, thumbnail: { nodes: [{ x: 0, y: 0, w: 100, h: 40, kind: "block" }], edges: [] }, tags: [] },
        ],
      }),
    );
    expect(html).toContain("Roadmap 2027");
    expect(html).toContain("Publicado");
  });
});
