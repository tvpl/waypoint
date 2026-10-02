<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Waypoint — project notes for agents

- UI copy is Brazilian Portuguese. Code, identifiers and comments are English.
- Design tokens live in `src/app/globals.css` (`bg-surface`, `text-muted`, `border-line`, `bg-accent-soft`…). Use them instead of raw colors so light/dark both work. Canvas node colors are the exception: they come from `src/lib/color.ts` and are theme-independent, with text contrast derived by `readableText()`.
- Server code lives in `src/server`; every module there imports `server-only`. Pages, server actions and API routes must re-check access (`requireWorkspace`, `getPlanWithAccess`, `atLeast`, `canEditWorkspace`) — never rely on hiding UI.
- The persisted plan format is `src/domain/plan.ts`. React Flow types stay inside `src/features/planner` behind `src/domain/canvas-adapter.ts`.
- Schema changes: edit `src/server/db/schema.ts`, then `npm run db:generate`. Search index (`search_index`, FTS5) is maintained by the services — call the index helpers when you add a new searchable entity.
- Any outbound request to a user-supplied URL must go through `safeFetch` (`src/server/lib/safe-fetch.ts`).
- Checks before committing: `npm run typecheck`, `npm test`, `npm run build`.
