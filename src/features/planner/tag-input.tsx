"use client";
import { useState } from "react";
import { TagChip } from "@/components/ui/misc";
import { normalizeTag, cn } from "@/lib/utils";

/** Free-text tag chips: Enter/comma adds, Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder = "+ tag", className, label = "Tags" }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string; className?: string; label?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map(normalizeTag).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next.slice(0, 30));
    setDraft("");
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {value.map((t) => (
        <TagChip key={t} name={t} onRemove={() => onChange(value.filter((x) => x !== t))} />
      ))}
      <input
        type="text"
        value={draft}
        aria-label={`Adicionar ${label.toLowerCase()}`}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        className="h-6 min-w-[64px] flex-1 rounded-full border border-dashed border-line-2 bg-transparent px-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </div>
  );
}
