export type MarkdownFieldChange = {
  field: string;
  before: string;
  after: string;
};
export type MarkdownReviewRow = {
  index: number;
  title: string;
  kind: "update" | "unchanged" | "conflict";
  message: string | null;
  changes: MarkdownFieldChange[];
};
export type MarkdownReview = { token: string; rows: MarkdownReviewRow[] };
