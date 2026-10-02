import * as React from "react";
import {
  Folder,
  Code2,
  BookOpen,
  Globe,
  Star,
  Sparkles,
  Briefcase,
  Palette,
  Bot,
  Server,
  Layers,
  GraduationCap,
  Music,
  Film,
  Heart,
  Rocket,
  FlaskConical,
  Newspaper,
  ShoppingBag,
  Map,
  Wrench,
  Lightbulb,
  Database,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const COLLECTION_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  folder: { icon: Folder, label: "Pasta" },
  code: { icon: Code2, label: "Código" },
  book: { icon: BookOpen, label: "Leitura" },
  globe: { icon: Globe, label: "Web" },
  star: { icon: Star, label: "Destaque" },
  sparkles: { icon: Sparkles, label: "Ideias" },
  briefcase: { icon: Briefcase, label: "Trabalho" },
  palette: { icon: Palette, label: "Design" },
  bot: { icon: Bot, label: "IA" },
  server: { icon: Server, label: "Infra" },
  database: { icon: Database, label: "Dados" },
  layers: { icon: Layers, label: "Arquitetura" },
  shield: { icon: Shield, label: "Segurança" },
  wrench: { icon: Wrench, label: "Ferramentas" },
  lightbulb: { icon: Lightbulb, label: "Aprendizado" },
  graduation: { icon: GraduationCap, label: "Cursos" },
  flask: { icon: FlaskConical, label: "Pesquisa" },
  newspaper: { icon: Newspaper, label: "Notícias" },
  rocket: { icon: Rocket, label: "Projetos" },
  music: { icon: Music, label: "Música" },
  film: { icon: Film, label: "Vídeo" },
  heart: { icon: Heart, label: "Pessoal" },
  shopping: { icon: ShoppingBag, label: "Compras" },
  map: { icon: Map, label: "Viagens" },
};

/** Soft palette: tint for tiles, ink for icons (light), and a lighter ink for dark mode. */
export const COLLECTION_COLORS: Record<string, { label: string; tint: string; ink: string; inkDark: string }> = {
  blue: { label: "Azul", tint: "#E8EDFF", ink: "#2F4FD8", inkDark: "#8EA2FF" },
  purple: { label: "Roxo", tint: "#EFE9FF", ink: "#5B3FC4", inkDark: "#B4A2F5" },
  teal: { label: "Verde-água", tint: "#DDF4EE", ink: "#0F6E5C", inkDark: "#6FD3BC" },
  orange: { label: "Laranja", tint: "#FFEADB", ink: "#A84A0F", inkDark: "#F4A673" },
  pink: { label: "Rosa", tint: "#FDE7F0", ink: "#A6265E", inkDark: "#F08FBA" },
  green: { label: "Verde", tint: "#E6F4DD", ink: "#3B6B1E", inkDark: "#9BD07A" },
  yellow: { label: "Amarelo", tint: "#FFF3C4", ink: "#6B4F00", inkDark: "#E9C75A" },
  slate: { label: "Grafite", tint: "#ECEDEF", ink: "#3D414A", inkDark: "#B5B8C2" },
};

export const DEFAULT_COLOR = "slate";

export function colorOf(color: string | null | undefined) {
  return COLLECTION_COLORS[color ?? ""] ?? COLLECTION_COLORS[DEFAULT_COLOR];
}

/**
 * Inline style for a colored tag chip (with the `wp-tint` class, which remixes it for
 * dark mode). Undefined for tags without a color: they keep the neutral chip.
 */
export function tagTint(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color || !COLLECTION_COLORS[color]) return undefined;
  const c = COLLECTION_COLORS[color];
  return { "--tint": c.tint, "--tint-ink": c.ink } as React.CSSProperties;
}

/** Collection icon in its color, theme-aware. */
export function CollectionGlyph({
  icon,
  color,
  size = 15,
  className,
}: {
  icon?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = COLLECTION_ICONS[icon ?? ""]?.icon ?? Folder;
  const c = colorOf(color);
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 text-[var(--c)] dark:text-[var(--cd)]", className)}
      style={{ "--c": c.ink, "--cd": c.inkDark } as React.CSSProperties}
    >
      <Icon style={{ width: size, height: size }} strokeWidth={1.75} />
    </span>
  );
}

/** Tinted square tile with the collection icon (used on share pages and pickers). */
export function CollectionTile({ icon, color, size = 28 }: { icon?: string | null; color?: string | null; size?: number }) {
  const Icon = COLLECTION_ICONS[icon ?? ""]?.icon ?? Folder;
  const c = colorOf(color);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: c.tint, color: c.ink }}
    >
      <Icon style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} strokeWidth={1.75} />
    </span>
  );
}
