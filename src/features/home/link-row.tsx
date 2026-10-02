"use client";
import Link from "next/link";
import { SiteIcon } from "@/components/ui/misc";

type Props = { id: string; title: string; url: string; domain: string; favicon: string | null; openBehavior: string; when: string };

/** Opens per the link's behavior; always records the open. */
export function LinkRow({ id, title, url, domain, favicon, openBehavior, when }: Props) {
  const record = () => {
    fetch(`/api/links/${id}/open`, { method: "POST" }).catch(() => {});
  };
  const inner = (
    <>
      <SiteIcon src={favicon} label={title} size={32} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{title}</span>
        <span className="truncate font-mono text-xs text-muted">{domain}</span>
      </span>
      <span className="shrink-0 text-xs text-muted">{when}</span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-surface";
  if (openBehavior === "new_tab") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={record} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={`/links?open=${id}`} className={cls}>
      {inner}
    </Link>
  );
}
