import type { LucideIcon } from "lucide-react";

/** One stop of a guided tour. `target` is the value of a `data-tour` attribute on the page. */
export type TourStep = {
  /** Element to highlight (`[data-tour="…"]`); omitted or missing on the page → a centered card. */
  target?: string;
  title: string;
  /** Plain text; keep it to one or two short sentences. */
  body: string;
};

export type HelpFeature = { title: string; text: string };

/** A module of the help center: what it is for, what it can do and its guided tour. */
export type HelpModule = {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Route where the tour runs; null when it needs a specific page (e.g. an open plan). */
  href: string | null;
  /** Pathnames where this module is "the current one" (contextual help, tour availability). */
  match: RegExp;
  /** One line for cards and lists. */
  summary: string;
  /** "Para que serve": two or three sentences. */
  purpose: string;
  /** "O que dá para fazer". */
  features: HelpFeature[];
  /** Short practical tips. */
  tips?: string[];
  /** Keyboard shortcuts: [description, keys] — keys use the Kbd notation ("⌘K", "g d", "n"). */
  shortcuts?: [string, string][];
  tour: TourStep[];
  /** Only shown in the desktop app. */
  desktopOnly?: boolean;
};
