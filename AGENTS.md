<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Numina — Agent Instructions

Instructions for coding agents and human contributors alike.

Numina is a **local-first, single-user money tracker**: no cloud, no login, no
telemetry. Financial data and privacy invariants take priority over convenience.

## Before writing code

1. Read `README.md` and `DATABASE.md` — they document the architecture,
   data model, and security model. (`PLAN.md` is the maintainer's internal
   plan and is not part of the repo.)
2. Read the relevant guide in `node_modules/next/dist/docs/` before writing
   any Next.js code (see the block above).
3. Read `src/lib/db/index.ts`, `src/lib/db/queries.ts`, and
   `src/lib/server/guard.ts` before touching data or API code.

## Hard rules (do not violate or "improve" these away)

- **Local-only stays local.** Never add network calls, cloud services,
  analytics, telemetry, auth providers, or external assets/styles/fonts.
  The CSP in `next.config.ts` is strict on purpose.
- **The DB is user financial data.** Never commit, copy, read, export, or
  log the contents of `data/` (`numina.db`, `*.db-wal`, `*.db-shm`).
  Do not reset or delete it without explicit user approval.
- **Loopback binding is non-negotiable.** Keep `next dev/start -H 127.0.0.1`
  in `package.json` scripts; never change host binding or disable the
  host/Origin guard (`lib/server/guard.ts`). All `/api/*` writes must remain
  behind the guard + Zod validation.
- **Money is signed integer cents** (`amount_cents`), end-to-end. No floats,
  no string amounts. Signs are applied at write time (deposit +, withdraw −,
  adjustment as given).
- **All SQL lives in `src/lib/db/queries.ts`** and must be prepared and
  parameterized. Never interpolate values into SQL.
- Never add secrets/keys to the repo; `.env*` is gitignored by design.

## Conventions

- Build scripts only from the existing `package.json` scripts (`pnpm dev`,
  `pnpm build`, `pnpm start`, `pnpm lint`). Dev server:
  http://127.0.0.1:3000.
- **Do not start the dev server or open the app to verify changes by default**
  (it costs tokens). Only run/browse the app when the user explicitly asks
  for it — when they do, use the existing scripts above.
- Do not treat `AGENTS.md`/`PLAN.md`/`README.md`/`DATABASE.md` as stale
  boilerplate: if a change alters behavior documented there, update the docs
  in the same change.
- When adding user-visible features, append to `releaseNotes.md`.

