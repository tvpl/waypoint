"use client";
import * as React from "react";
import { monogramColors } from "@/lib/color";

/** Card cover: uploaded / og image, or a tinted monogram placeholder when missing or broken. */
export function Cover({ link }: { link: { title: string; domain: string; coverImage: string | null } }) {
  const [failed, setFailed] = React.useState(false);
  const { bg, fg } = monogramColors(link.domain || link.title);
  const letter = (link.title.trim()[0] ?? link.domain[0] ?? "?").toUpperCase();
  if (link.coverImage && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={link.coverImage}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-end p-3"
      style={{ backgroundColor: bg, backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1.2px, transparent 1.2px)", backgroundSize: "14px 14px" }}
    >
      <span className="font-display text-[54px] leading-none opacity-90" style={{ color: fg }}>
        {letter}
      </span>
    </div>
  );
}
