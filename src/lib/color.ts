/**
 * Node colors are theme-independent; text/border colors are derived from the
 * chosen fill so contrast stays readable in light and dark themes.
 */
export const NODE_PALETTE = [
  { name: "Neutro", value: "#FFFFFF" },
  { name: "Azul", value: "#E8EDFF" },
  { name: "Roxo", value: "#EFE9FF" },
  { name: "Verde-água", value: "#DDF4EE" },
  { name: "Laranja", value: "#FFEADB" },
  { name: "Rosa", value: "#FDE7F0" },
  { name: "Amarelo", value: "#FFF3C4" },
  { name: "Verde", value: "#E6F4DD" },
  { name: "Cobalto", value: "#2F4FD8" },
  { name: "Violeta", value: "#5B3FC4" },
  { name: "Petróleo", value: "#0F6E5C" },
  { name: "Grafite", value: "#17171C" },
] as const;

/** Accent ink paired with each soft tint (used for icon tiles). */
export const TINT_INK: Record<string, string> = {
  "#E8EDFF": "#2F4FD8",
  "#EFE9FF": "#5B3FC4",
  "#DDF4EE": "#0F6E5C",
  "#FFEADB": "#A84A0F",
  "#FDE7F0": "#A6265E",
  "#FFF3C4": "#6B4F00",
  "#E6F4DD": "#3B6B1E",
  "#FFFFFF": "#3D414A",
};

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function readableText(bg: string): { fg: string; muted: string; border: string; ink: string } {
  const dark = luminance(bg) < 0.4;
  if (dark) return { fg: "#FFFFFF", muted: "#C9CAD3", border: "rgba(255,255,255,.18)", ink: "#FFFFFF" };
  return {
    fg: "#17171C",
    muted: "#5E5F68",
    border: bg.toUpperCase() === "#FFFFFF" ? "#D6D6D0" : "rgba(23,23,28,.12)",
    ink: TINT_INK[bg.toUpperCase()] ?? "#3D414A",
  };
}

/** Deterministic tint for monograms (favicons fallback). */
const MONO_TINTS = ["#E8EDFF", "#EFE9FF", "#DDF4EE", "#FFEADB", "#FDE7F0", "#E6F4DD", "#FFF3C4"];
export function monogramColors(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bg = MONO_TINTS[h % MONO_TINTS.length];
  return { bg, fg: TINT_INK[bg] };
}
