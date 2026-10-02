import { ViewTransition } from "react";

/** Re-mounts on every page change inside the app shell: the new page rises in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="wp-vt-page" exit="wp-vt-page" default="none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
