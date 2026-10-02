import type { Thumb } from "@/domain/plan-thumb";

/**
 * Miniature of a plan: boxes and connections drawn as SVG, scaled to fit. Default
 * fills come from theme tokens (so dark mode isn't a field of white boxes); chosen
 * node colors are kept, as on the canvas.
 */
export function PlanThumb({ thumb, height = 116 }: { thumb: Thumb; height?: number }) {
  const { nodes, edges } = thumb;
  if (nodes.length === 0) {
    return <div className="dot-grid border-b border-line" style={{ height }} aria-hidden />;
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 8;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const center = (i: number) => ({ x: nodes[i].x + nodes[i].w / 2, y: nodes[i].y + nodes[i].h / 2 });
  // Stroke widths in viewBox units that read as ~1px at thumbnail size.
  const unit = (maxX - minX + pad * 2) / 320;
  return (
    <div className="relative overflow-hidden border-b border-line bg-surface-2" style={{ height }} aria-hidden>
      <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {edges.map(([a, b], i) => {
          const p = center(a);
          const q = center(b);
          const mx = (p.x + q.x) / 2;
          return (
            <path
              key={i}
              d={`M ${p.x} ${p.y} C ${mx} ${p.y}, ${mx} ${q.y}, ${q.x} ${q.y}`}
              fill="none"
              stroke="var(--line-2)"
              strokeWidth={unit * 1.4}
            />
          );
        })}
        {nodes.map((n, i) => {
          const area = n.kind === "container" || n.kind === "section";
          const text = n.kind === "text";
          if (text) return <rect key={i} x={n.x} y={n.y + n.h * 0.3} width={n.w * 0.7} height={n.h * 0.4} rx={unit * 2} fill="var(--line-2)" />;
          return (
            <rect
              key={i}
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={area ? unit * 6 : unit * 4}
              fill={tinted(n.color ?? (n.kind === "note" && !area ? "#FFF3C4" : null), area)}
              stroke={area || !n.color ? "var(--line-2)" : `color-mix(in srgb, ${n.color} 40%, var(--line-2))`}
              strokeWidth={unit}
              strokeDasharray={area && !n.color ? `${unit * 4} ${unit * 3}` : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** Fill for a node color, mixed into the surface like the canvas does in dark mode. */
function tinted(color: string | null, area: boolean) {
  if (!color) return area ? "transparent" : "var(--surface)";
  return `color-mix(in srgb, ${color} var(${area ? "--thumb-area-tint" : "--thumb-tint"}), ${area ? "transparent" : "var(--surface)"})`;
}
