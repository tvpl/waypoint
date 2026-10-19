import {
  BarChart3,
  Bookmark,
  Calendar,
  CheckCircle2,
  CircleHelp,
  Code2,
  FileText,
  Folder,
  Globe,
  Inbox,
  Link2,
  ListTodo,
  Mail,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Target,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ShortcutColor, ShortcutIcon } from "@/domain/dashboard";
import { cn } from "@/lib/utils";

export const SHORTCUT_ICON: Record<ShortcutIcon, LucideIcon> = {
  link: Link2,
  plus: Plus,
  sun: Sun,
  "list-todo": ListTodo,
  check: CheckCircle2,
  calendar: Calendar,
  workflow: Workflow,
  inbox: Inbox,
  star: Star,
  bookmark: Bookmark,
  folder: Folder,
  "file-text": FileText,
  chart: BarChart3,
  shield: ShieldCheck,
  help: CircleHelp,
  search: Search,
  mail: Mail,
  users: Users,
  code: Code2,
  rocket: Rocket,
  target: Target,
  zap: Zap,
  globe: Globe,
  settings: Settings,
};

/** Rounded tile with the shortcut's icon; pastel colors are theme-aware pairs (see globals.css). */
export function ShortcutGlyph({ icon, color, size = 36, className }: { icon: ShortcutIcon; color: ShortcutColor; size?: number; className?: string }) {
  const Icon = SHORTCUT_ICON[icon] ?? Link2;
  return (
    <span
      aria-hidden
      data-color={color === "accent" ? undefined : color}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[10px] transition-transform",
        color === "accent" ? "bg-accent-soft text-accent-ink" : "wp-task-color border-0",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.48) }} strokeWidth={1.9} />
    </span>
  );
}
