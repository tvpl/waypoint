import type { ThumbNode } from "@/server/services/plans";
import { readableText } from "@/lib/color";

/** Miniature of a plan's layout, scaled to fit (pure CSS, no canvas lib). */
export function PlanThumb({ nodes, height = 116 }: { nodes: ThumbNode[]; height?: number }) {
  const pad = 14;
  if (nodes.length === 0) {
    return <div className="dot-grid border-b border-line" style={{ height }} aria-hidden />;
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  // width is fluid: express positions in % horizontally, px vertically
  const scaleY = (height - pad * 2) / h;
  const aspect = w / h;
  return (
    <div className="relative overflow-hidden border-b border-line bg-surface-2" style={{ height }} aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ height: height - pad * 2, width: `min(calc(100% - ${pad * 2}px), ${Math.round((height - pad * 2) * aspect)}px)` }}
      >
        {nodes.map((n, i) => {
          const container = n.kind === "container" || n.kind === "section";
          const fill = n.color ?? (n.kind === "note" ? "#FFF3C4" : container ? "transparent" : "#E8EDFF");
          return (
            <div
              key={i}
              className="absolute rounded-[3px]"
              style={{
                left: `${((n.x - minX) / w) * 100}%`,
                top: (n.y - minY) * scaleY,
                width: `${(n.w / w) * 100}%`,
                height: Math.max(3, n.h * scaleY),
                background: container ? (n.color ? `${n.color}55` : "transparent") : fill,
                border: container ? "1px dashed var(--line-2)" : `1px solid ${readableText(fill === "transparent" ? "#FFFFFF" : fill).border}`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
