import type { Glyph } from "@/domain/plan";

/**
 * An icon's drawing: outlined strokes (interface icons) or filled paths (brand logos), in `color`.
 * Path data only — stored icons never render markup.
 */
export function GlyphSvg({ glyph, size, color = "currentColor", strokeWidth = 2, className }: { glyph: Glyph; size: number; color?: string; strokeWidth?: number; className?: string }) {
  return (
    <svg viewBox={glyph.viewBox} width={size} height={size} className={className} aria-hidden>
      {glyph.paths.map((d, i) =>
        glyph.filled ? (
          <path key={i} d={d} fill={color} />
        ) : (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        ),
      )}
    </svg>
  );
}
