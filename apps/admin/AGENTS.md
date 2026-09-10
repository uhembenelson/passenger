<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

- Any feature that creates data must ship full CRUD — Create, Read, Update, Delete — for both backend and UI. Never stop at create-only.
- Font: the project's font is Work Sans, and the proven-working stack is `font-family:"Work Sans",Arial,Helvetica,sans-serif` (equivalent to the `--ds-font-family-sans` token = `var(--font-work-sans), Work Sans, Arial, Helvetica, sans-serif`). Always use Work Sans for UI text. Never introduce a different font-family, never strip the fallbacks from this stack, and do not switch UI text over to a bare `var(--font-work-sans)`-only stack — the stack above is the one that renders correctly.
