"use client";
import * as React from "react";
import { monogramColors } from "@/lib/color";

type CoverLink = { title: string; domain: string; coverImage: string | null; favicon?: string | null; icon?: string | null };

/** Image that reports load failures, including ones that happened before hydration. */
function useImageFallback() {
  const [failed, setFailed] = React.useState(false);
  const props = {
    onError: () => setFailed(true),
    // errors that happen before hydration never fire onError
    ref: (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth === 0) setFailed(true);
    },
  };
  return [failed, props] as const;
}

/**
 * Card cover: uploaded / og image, or a generated cover — a soft gradient in the site's
 * tint with its icon (or monogram) on a raised tile. The tint adapts to the dark theme
 * through the `wp-cover` utility in globals.css.
 */
export function Cover({ link }: { link: CoverLink }) {
  const [coverFailed, coverProps] = useImageFallback();
  const [iconFailed, iconProps] = useImageFallback();
  const { bg, fg } = monogramColors(link.domain || link.title);
  const letter = (link.title.trim()[0] ?? link.domain[0] ?? "?").toUpperCase();
  const icon = link.icon || link.favicon;

  if (link.coverImage && !coverFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={link.coverImage}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        {...coverProps}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
      />
    );
  }
  return (
    <div aria-hidden className="wp-cover absolute inset-0 flex items-center justify-center" style={{ "--tint": bg, "--tint-ink": fg } as React.CSSProperties}>
      <span className="wp-cover-tile relative flex size-14 items-center justify-center rounded-2xl transition-transform duration-300 ease-out group-hover:-translate-y-0.5 group-hover:scale-105">
        {icon && !iconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" width={30} height={30} referrerPolicy="no-referrer" loading="lazy" {...iconProps} className="size-[30px] object-contain" />
        ) : (
          <span className="font-display font-semibold text-display-sm leading-none">{letter}</span>
        )}
      </span>
    </div>
  );
}
