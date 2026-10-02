/** Shared checks for global keyboard shortcuts. */

/** The event comes from a text field (shortcuts must not hijack typing). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** A dialog or menu is open (ignores ones still animating out). */
export function overlayOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [role="menu"]:not([data-state="closed"])',
  );
}
