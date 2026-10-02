"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn, normalizeTag } from "@/lib/utils";

/** Chip input: Enter / comma / Tab adds, Backspace on empty removes the last one. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder = "Adicionar tag…",
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: { name: string; count: number }[];
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
    setHi(0);
  };
  const q = normalizeTag(draft);
  const available = suggestions.filter((s) => !value.includes(s.name));
  const matches = q ? available.filter((s) => s.name.includes(q)).slice(0, 6) : [];
  const top = available.slice(0, 4);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <div
          className={cn(
            "flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-control border border-line-2 bg-surface px-2 py-1 transition-[border,box-shadow]",
            focus && "border-accent ring-3 ring-accent/15",
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-subtle py-0.5 pl-2 pr-1 text-xs text-ink-2">
              #{t}
              <button
                type="button"
                aria-label={`Remover tag ${t}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== t));
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={draft}
            placeholder={value.length ? "" : placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={focus && matches.length > 0}
            aria-autocomplete="list"
            onFocus={() => setFocus(true)}
            onBlur={() => {
              setFocus(false);
              if (draft.trim()) add(draft);
            }}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes(",")) {
                v.split(",").slice(0, -1).forEach(add);
                setDraft(v.split(",").at(-1) ?? "");
              } else {
                setDraft(v);
                setHi(0);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || (e.key === "Tab" && draft.trim())) {
                if (e.metaKey || e.ctrlKey) return; // let ⌘↵ submit the form
                if (!draft.trim()) return;
                e.preventDefault();
                add(matches[hi]?.name ?? draft);
              } else if (e.key === "Backspace" && !draft && value.length) {
                onChange(value.slice(0, -1));
              } else if (e.key === "ArrowDown" && matches.length) {
                e.preventDefault();
                setHi((h) => (h + 1) % matches.length);
              } else if (e.key === "ArrowUp" && matches.length) {
                e.preventDefault();
                setHi((h) => (h - 1 + matches.length) % matches.length);
              } else if (e.key === "Escape" && draft) {
                e.stopPropagation();
                setDraft("");
              }
            }}
            className="h-7 min-w-24 flex-1 bg-transparent text-body text-ink outline-none"
          />
        </div>
        {focus && matches.length > 0 && (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-line bg-surface p-1 shadow-pop">
            {matches.map((m, i) => (
              <li key={m.name} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(m.name);
                  }}
                  className={cn("flex h-8 w-full items-center justify-between rounded-md px-2.5 text-body", i === hi ? "bg-accent-soft text-accent-ink" : "hover:bg-hover")}
                >
                  <span>#{m.name}</span>
                  <span className="text-xs text-muted">{m.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {top.length > 0 && (
        <p className="text-xs text-muted">
          Sugeridas:{" "}
          {top.map((s, i) => (
            <React.Fragment key={s.name}>
              {i > 0 && " · "}
              <button type="button" onClick={() => add(s.name)} className="text-accent-ink hover:underline">
                #{s.name}
              </button>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
