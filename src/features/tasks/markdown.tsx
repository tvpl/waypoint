import { Fragment, type ReactNode } from "react";

/** A deliberately small, safe Markdown reader. Raw HTML is always rendered as text. */
function inline(text: string): ReactNode[] {
  return text
    .split(
      /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*]+\*)/g,
    )
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code
            key={i}
            className="rounded bg-subtle px-1 py-0.5 font-mono text-xs"
          >
            {part.slice(1, -1)}
          </code>
        );
      if (part.startsWith("*") && part.endsWith("*"))
        return <em key={i}>{part.slice(1, -1)}</em>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link)
        return (
          <a
            key={i}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-ink underline underline-offset-2"
          >
            {link[1]}
          </a>
        );
      return <Fragment key={i}>{part}</Fragment>;
    });
}
export function TaskMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;
  text.split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      if (code) {
        blocks.push(
          <pre
            key={i}
            className="overflow-x-auto rounded-control bg-subtle p-3 font-mono text-xs"
          >
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else code = [];
    } else if (code) code.push(line);
    else if (/^#{1,6}\s/.test(line))
      blocks.push(
        <p key={i} className="pt-2 font-semibold text-ink">
          {inline(line.replace(/^#{1,6}\s/, ""))}
        </p>,
      );
    else if (/^\s*[-*]\s/.test(line))
      blocks.push(
        <div key={i} className="flex gap-2 pl-1">
          <span className="text-muted">•</span>
          <span>{inline(line.replace(/^\s*[-*]\s/, ""))}</span>
        </div>,
      );
    else if (line.startsWith("> "))
      blocks.push(
        <blockquote
          key={i}
          className="border-l-2 border-accent-line pl-3 text-muted"
        >
          {inline(line.slice(2))}
        </blockquote>,
      );
    else
      blocks.push(
        <p key={i} className={line ? "whitespace-pre-wrap" : "h-2"}>
          {inline(line)}
        </p>,
      );
  });
  if (code)
    blocks.push(
      <pre
        key="end"
        className="overflow-x-auto rounded-control bg-subtle p-3 font-mono text-xs"
      >
        {(code as string[]).join("\n")}
      </pre>,
    );
  return (
    <div className="space-y-1 break-words text-sm leading-6 text-ink-2">
      {blocks}
    </div>
  );
}
