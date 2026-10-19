/** Items stay in the trash this long before they're deleted for good. */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const TRASH_TYPES = ["plan", "collection", "favorite"] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

export type TrashRef = { type: TrashType; id: string };

/** One row of the trash. Sub-collections and links trashed with a collection travel inside it. */
export type TrashItem = TrashRef & {
  title: string;
  /** Epoch ms. */
  deletedAt: number;
  /** When the purge deletes it for good (epoch ms). */
  purgeAt: number;
  icon: string | null;
  color: string | null;
  /** Plans: description. Links: domain. */
  detail: string | null;
  /** Links: the page URL and its icon. */
  url?: string;
  favicon?: string | null;
  /** Collections: links and sub-collections that come back with it. */
  linkCount?: number;
  collectionCount?: number;
  /**
   * Collections: where their links go when the collection is deleted for good (parent name;
   * null = "Sem coleção"). Links: where a restore puts them (collection name; null = "Sem coleção").
   */
  destination?: string | null;
};
