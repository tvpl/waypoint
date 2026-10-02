import type { LinkHealth, OpenBehavior, SummaryBehavior, Visibility } from "@/server/db/schema";

export type { LinkHealth, OpenBehavior, SummaryBehavior, Visibility };

export type ViewMode = "cards" | "compact" | "list";
export type SummaryMode = "default" | SummaryBehavior;
export type Scope = "all" | "recent" | "starred" | "unsorted" | "broken" | "archived" | "shared";
export type SortMode = "manual" | "recent" | "title" | "opened";

export const VIEW_MODES: ViewMode[] = ["cards", "compact", "list"];
export const SCOPES: Scope[] = ["all", "recent", "starred", "unsorted", "broken", "archived", "shared"];
export const SORT_MODES: SortMode[] = ["manual", "recent", "title", "opened"];

/** Client-safe collection tree node (dates stripped). */
export type TreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  visibility: Visibility;
  defaultView: ViewMode;
  linkCount: number;
  totalCount: number;
  children: TreeNode[];
};

/** Client-safe link (dates as epoch ms). */
export type LinkItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  description: string | null;
  keywords: string | null;
  favicon: string | null;
  coverImage: string | null;
  icon: string | null;
  openBehavior: OpenBehavior;
  summaryBehavior: SummaryBehavior;
  collectionId: string | null;
  collectionName: string | null;
  tags: string[];
  starred: boolean;
  openCount: number;
  lastOpenedAt: number | null;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  /** Last link health check (see server/services/link-health.ts). */
  healthStatus: LinkHealth;
  healthCode: number | null;
  healthCheckedAt: number | null;
  healthFinalUrl: string | null;
};

export type CurrentCollection = TreeNode & {
  pinned: boolean;
  shareToken: string | null;
  path: { id: string; name: string }[];
};

export type TagCount = { name: string; count: number };

export type LibraryCounts = { all: number; starred: number; unsorted: number; archived: number; recent: number; shared: number; broken: number };

export type Backlink = { planId: string; planTitle: string; nodeId: string; nodeTitle: string | null };

export type LinkDetail = {
  link: LinkItem;
  path: { id: string; name: string }[];
  backlinks: Backlink[];
  canEdit: boolean;
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  workspace: "Workspace",
  private: "Privado",
  specific: "Pessoas específicas",
  link: "Qualquer pessoa com o link",
  public: "Público",
};
