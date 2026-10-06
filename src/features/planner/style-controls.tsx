"use client";
/**
 * Style pickers for drawn shapes and arrows (Excalidraw's vocabulary): colors, fill pattern,
 * stroke width and dash, clean or hand-drawn, corners, font, size, alignment, arrowheads, route.
 * Shared by the floating style bar and the inspector.
 */
import { createContext, useContext, useEffect, useRef } from "react";
import { AlignCenter, AlignLeft, AlignRight, Pipette, Plus, Spline } from "lucide-react";
import type { Arrowhead } from "@/domain/plan";
import { Tooltip } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FILL_COLORS, STROKE_COLORS, type DrawStyle } from "./shape-geometry";

const opt = (on: boolean) =>
  cn(
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-ink-2 transition-colors hover:bg-hover hover:text-ink [&_svg]:size-4",
    on && "bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink",
  );

function Group({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex items-center gap-0.5", className)}>
      {children}
    </div>
  );
}

function Choice({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={label}>
      <button type="button" role="radio" aria-checked={on} aria-label={label} className={opt(on)} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  );
}

/** The plan's own colors, offered after the fixed ones in every color picker (the editor provides it). */
export const PaletteContext = createContext<{ colors: string[]; add: (hex: string) => void } | null>(null);

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** The plan's colors, then "+" (any color) and the eyedropper (pick a color from the screen). */
export function PlanColors({ value, onChange, size, square }: { value: string | undefined; onChange: (v: string) => void; size: number; square?: boolean }) {
  const palette = useContext(PaletteContext);
  const input = useRef<HTMLInputElement>(null);
  const cb = useRef({ onChange, palette });
  cb.current = { onChange, palette };
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    // "change" fires once the system picker closes (not on every drag of it).
    const done = () => {
      const hex = el.value.toUpperCase();
      cb.current.onChange(hex);
      cb.current.palette?.add(hex);
    };
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  }, []);
  if (!palette) return null;
  const Dropper = typeof window !== "undefined" ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined;
  const pick = async () => {
    if (!Dropper) return;
    try {
      const { sRGBHex } = await new Dropper().open();
      const hex = /^#[0-9a-f]{6}$/i.test(sRGBHex) ? sRGBHex.toUpperCase() : rgbToHex(sRGBHex);
      if (!hex) return;
      onChange(hex);
      palette.add(hex);
    } catch {
      /* cancelled */
    }
  };
  const small = cn("inline-flex shrink-0 items-center justify-center text-muted transition-colors hover:bg-hover hover:text-ink [&_svg]:size-3.5", square ? "rounded-md" : "rounded-full");
  return (
    <>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />
      {palette.colors.map((c) => {
        const on = !!value && value.toUpperCase() === c.toUpperCase();
        return (
          <Tooltip key={c} content={`${c} · paleta do plan`}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Cor ${c}`}
              onClick={() => onChange(c)}
              className={cn("shrink-0 border-2 border-surface", square ? "rounded-md" : "rounded-full")}
              style={{ width: size, height: size, background: c, boxShadow: on ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
            />
          </Tooltip>
        );
      })}
      <Tooltip content="Outra cor (entra na paleta do plan)">
        <button type="button" aria-label="Outra cor" className={small} style={{ width: size + 2, height: size + 2 }} onClick={() => input.current?.click()}>
          <Plus />
        </button>
      </Tooltip>
      <input ref={input} type="color" tabIndex={-1} aria-hidden className="pointer-events-none absolute size-0 opacity-0" defaultValue={value ?? "#2F4FD8"} />
      {Dropper && (
        <Tooltip content="Conta-gotas: pegar uma cor da tela">
          <button type="button" aria-label="Conta-gotas" className={small} style={{ width: size + 2, height: size + 2 }} onClick={pick}>
            <Pipette />
          </button>
        </Tooltip>
      )}
    </>
  );
}

function rgbToHex(css: string): string | null {
  const m = css.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function StrokeColors({ value, onChange, size = 20 }: { value: string | undefined; onChange: (v: string | undefined) => void; size?: number }) {
  return (
    <Group label="Cor do traço" className="relative flex-wrap gap-1 px-0.5">
      {STROKE_COLORS.map((c) => {
        const on = (c.value ?? null) === (value ?? null);
        return (
          <Tooltip key={c.name} content={c.name}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              onClick={() => onChange(c.value)}
              className="shrink-0 rounded-full border-2 border-surface"
              style={{ width: size, height: size, background: c.value ?? "var(--ink)", boxShadow: on ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)" }}
            />
          </Tooltip>
        );
      })}
      <PlanColors value={value} onChange={onChange} size={size} />
    </Group>
  );
}

export function FillColors({ value, onChange, size = 20 }: { value: string | undefined; onChange: (v: string | undefined) => void; size?: number }) {
  return (
    <Group label="Fundo" className="relative flex-wrap gap-1 px-0.5">
      {FILL_COLORS.map((c) => {
        const on = (c.value ?? null) === (value ?? null);
        return (
          <Tooltip key={c.name} content={c.name}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              onClick={() => onChange(c.value)}
              className="relative shrink-0 overflow-hidden rounded-md border-2 border-surface"
              style={{
                width: size,
                height: size,
                background: c.value ?? "repeating-conic-gradient(var(--line-2) 0 25%, var(--surface) 0 50%) 0 0 / 8px 8px",
                boxShadow: on ? "0 0 0 2px var(--accent)" : "0 0 0 1px var(--line-2)",
              }}
            />
          </Tooltip>
        );
      })}
      <PlanColors value={value} onChange={onChange} size={size} square />
    </Group>
  );
}

const glyph = "block size-4";

export function FillStylePicker({ value, onChange }: { value: DrawStyle["fillStyle"]; onChange: (v: DrawStyle["fillStyle"]) => void }) {
  const items: { v: DrawStyle["fillStyle"]; label: string; svg: React.ReactNode }[] = [
    { v: "solid", label: "Sólido", svg: <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" /> },
    {
      v: "hachure",
      label: "Hachura",
      svg: (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 9 L9 3 M3 13 L13 3 M7 13 L13 7" stroke="currentColor" strokeWidth="1.2" />
        </>
      ),
    },
    {
      v: "cross-hatch",
      label: "Hachura cruzada",
      svg: (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3 9 L9 3 M3 13 L13 3 M7 13 L13 7 M7 3 L13 9 M3 3 L13 13 M3 7 L9 13" stroke="currentColor" strokeWidth="1" />
        </>
      ),
    },
    {
      v: "dots",
      label: "Pontilhado",
      svg: (
        <>
          <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {[5, 8, 11].flatMap((x) => [5, 8, 11].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" fill="currentColor" />))}
        </>
      ),
    },
  ];
  return (
    <Group label="Preenchimento">
      {items.map((i) => (
        <Choice key={i.v} label={i.label} on={value === i.v} onClick={() => onChange(i.v)}>
          <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
            {i.svg}
          </svg>
        </Choice>
      ))}
    </Group>
  );
}

export function WidthPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Group label="Espessura">
      {[
        { v: 1, label: "Fina" },
        { v: 2, label: "Média" },
        { v: 4, label: "Grossa" },
      ].map((w) => (
        <Choice key={w.v} label={w.label} on={value === w.v} onClick={() => onChange(w.v)}>
          <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
            <path d="M2 8 H14" stroke="currentColor" strokeWidth={w.v * 1.1} strokeLinecap="round" />
          </svg>
        </Choice>
      ))}
    </Group>
  );
}

export function StrokeStylePicker({ value, onChange }: { value: DrawStyle["strokeStyle"]; onChange: (v: DrawStyle["strokeStyle"]) => void }) {
  return (
    <Group label="Estilo do traço">
      {(
        [
          ["solid", "Contínuo", undefined],
          ["dashed", "Tracejado", "4 3"],
          ["dotted", "Pontilhado", "0.5 3"],
        ] as const
      ).map(([v, label, dash]) => (
        <Choice key={v} label={label} on={value === v} onClick={() => onChange(v)}>
          <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
            <path d="M2 8 H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
          </svg>
        </Choice>
      ))}
    </Group>
  );
}

/** Clean, hand-drawn or very sketchy. */
export function RoughnessPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Group label="Traçado">
      {[
        { v: 0, label: "Limpo", d: "M2 11 C5 4, 11 4, 14 11" },
        { v: 1, label: "À mão", d: "M2 11 C4 5, 7 4.5, 9 5 S13 7, 14 11" },
        { v: 2, label: "Rabiscado", d: "M2 11 C3 6, 5 4, 7 6 S9 3, 10 5 S13 6, 14 11" },
      ].map((r) => (
        <Choice key={r.v} label={r.label} on={Math.round(value) === r.v} onClick={() => onChange(r.v)}>
          <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
            <path d={r.d} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </Choice>
      ))}
    </Group>
  );
}

export function CornersPicker({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Group label="Cantos">
      <Choice label="Retos" on={!value} onClick={() => onChange(false)}>
        <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
          <path d="M3 13 V3 H13" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
      </Choice>
      <Choice label="Arredondados" on={value} onClick={() => onChange(true)}>
        <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
          <path d="M3 13 V8 Q3 3 8 3 H13" stroke="currentColor" strokeWidth="1.8" fill="none" />
        </svg>
      </Choice>
    </Group>
  );
}

export function FontPicker({ value, onChange }: { value: DrawStyle["font"]; onChange: (v: DrawStyle["font"]) => void }) {
  return (
    <Group label="Fonte">
      <Choice label="À mão" on={value === "hand"} onClick={() => onChange("hand")}>
        <span className="px-0.5 text-[15px] leading-none" style={{ fontFamily: 'Excalifont, "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' }}>
          Aa
        </span>
      </Choice>
      <Choice label="Normal" on={value === "sans"} onClick={() => onChange("sans")}>
        <span className="px-0.5 text-[14px] font-semibold leading-none">Aa</span>
      </Choice>
      <Choice label="Código" on={value === "mono"} onClick={() => onChange("mono")}>
        <span className="px-0.5 font-mono text-[13px] leading-none">{"</>"}</span>
      </Choice>
    </Group>
  );
}

export function SizePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Group label="Tamanho do texto">
      {[
        { v: 16, l: "P" },
        { v: 20, l: "M" },
        { v: 28, l: "G" },
        { v: 40, l: "GG" },
      ].map((s) => (
        <Choice key={s.v} label={`Tamanho ${s.l}`} on={value === s.v} onClick={() => onChange(s.v)}>
          <span className="text-caption font-semibold">{s.l}</span>
        </Choice>
      ))}
    </Group>
  );
}

export function AlignPicker({ value, onChange }: { value: DrawStyle["align"]; onChange: (v: DrawStyle["align"]) => void }) {
  return (
    <Group label="Alinhamento">
      <Choice label="À esquerda" on={value === "left"} onClick={() => onChange("left")}>
        <AlignLeft />
      </Choice>
      <Choice label="Centralizado" on={value === "center"} onClick={() => onChange("center")}>
        <AlignCenter />
      </Choice>
      <Choice label="À direita" on={value === "right"} onClick={() => onChange("right")}>
        <AlignRight />
      </Choice>
    </Group>
  );
}

const HEADS: { v: Arrowhead; label: string; d: string; filled?: boolean }[] = [
  { v: "none", label: "Sem ponta", d: "" },
  { v: "arrow", label: "Seta", d: "M9 4 L13 8 L9 12" },
  { v: "triangle", label: "Triângulo", d: "M9 4.5 L13.5 8 L9 11.5 Z", filled: true },
  { v: "dot", label: "Ponto", d: "M10 8 m-2.6 0 a2.6 2.6 0 1 0 5.2 0 a2.6 2.6 0 1 0 -5.2 0", filled: true },
  { v: "bar", label: "Barra", d: "M13 4 V12" },
];

export function ArrowheadPicker({ label, value, onChange, flip }: { label: string; value: Arrowhead; onChange: (v: Arrowhead) => void; flip?: boolean }) {
  return (
    <Group label={label}>
      {HEADS.map((h) => (
        <Choice key={h.v} label={h.label} on={value === h.v} onClick={() => onChange(h.v)}>
          <svg viewBox="0 0 16 16" className={cn(glyph, flip && "-scale-x-100")} aria-hidden>
            <path d="M2 8 H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            {h.d && <path d={h.d} stroke="currentColor" strokeWidth="1.6" fill={h.filled ? "currentColor" : "none"} strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </Choice>
      ))}
    </Group>
  );
}

export function RoutingPicker({ value, onChange }: { value: DrawStyle["routing"]; onChange: (v: DrawStyle["routing"]) => void }) {
  return (
    <Group label="Trajeto">
      <Choice label="Reto" on={value === "straight"} onClick={() => onChange("straight")}>
        <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
          <path d="M3 13 L13 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </Choice>
      <Choice label="Curvo" on={value === "curve"} onClick={() => onChange("curve")}>
        <Spline />
      </Choice>
      <Choice label="Cotovelo" on={value === "elbow"} onClick={() => onChange("elbow")}>
        <svg viewBox="0 0 16 16" className={glyph} aria-hidden>
          <path d="M3 13 V8 H13 V3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        </svg>
      </Choice>
    </Group>
  );
}

export function OpacitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        aria-label="Opacidade"
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
      />
      <span className="w-9 text-right text-caption tabular-nums text-muted">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** A range with its value at the end, like the opacity slider. */
export function ValueSlider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="range" min={min} max={max} step={step} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 min-w-0 flex-1 accent-[var(--accent)]" />
      <span className="w-10 text-right text-caption tabular-nums text-muted">
        {value}
        {unit}
      </span>
    </div>
  );
}
