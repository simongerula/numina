# Contributing to Numina

Thanks for wanting to help! Numina is a **local-first, single-user money
tracker** — no cloud, no login, no telemetry. Before anything else, please
read [AGENTS.md](./AGENTS.md): it lists the non-negotiable invariants of the
project (local-only, integer-cents money, guarded writes). PRs that violate
those invariants will be asked to change, no matter how good the code is.

## Getting started

One-time setup (macOS or Linux; see "Windows" below):

```bash
git clone https://github.com/simongerula/numina.git
cd numina
pnpm numina install   # deps + production build + global `numina` command
```

Prerequisites: Node.js 22.13+ and pnpm (see the README for details). The app
creates its own SQLite database at `data/numina.db` on first run — **never
commit or share that file**; it's real financial data.

## Everyday workflow

```bash
numina dev    # or: pnpm dev  — hot-reload dev server on http://127.0.0.1:3000
pnpm lint     # ESLint (must be clean)
pnpm exec tsc --noEmit   # typecheck (must be clean)
pnpm test     # Vitest suite (must be green)
```

`pnpm build && pnpm start` runs the production build, also on loopback only.

## Rules of the codebase

- **Local-only stays local.** No network calls, cloud services, analytics,
  telemetry, auth providers, or external assets/styles/fonts. The CSP in
  `next.config.ts` is strict on purpose.
- **The DB is user financial data.** Never commit, copy, read, export, or log
  the contents of `data/`. Tests must never touch it — they run against an
  in-memory SQLite database (see `src/lib/db/__tests__/`).
- **Loopback binding and the guard are non-negotiable.** Keep
  `-H 127.0.0.1` in the scripts; every `/api/*` write stays behind
  `lib/server/guard.ts` + Zod validation.
- **Money is signed integer cents** (`amount_cents`) end-to-end. No floats,
  no string amounts. Signs are applied at write time.
- **All SQL lives in `src/lib/db/queries.ts`**, prepared and parameterized.
  Never interpolate values into SQL.
- **No migrations system yet.** The schema is `CREATE TABLE IF NOT EXISTS`,
  applied on first run. If your change needs a schema change, open an issue
  first so we can design the migration path together.
- If a change alters behavior documented in `README.md` or `DATABASE.md`,
  update those docs in the same PR.

## Submitting a PR

1. Fork, then create a branch from `main`.
2. Keep PRs small and focused — one feature or fix per PR.
3. Make sure `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm test` all pass
   locally. CI runs the same three checks on every PR.
4. New user-visible features should update the relevant docs. New API
   endpoints need guard + Zod coverage and a test.
5. Describe *why* in the PR description, not just *what*.

## Windows

Windows is supported for running the app. `numina install` works too — it
drops a `numina.cmd` shim into pnpm's global bin dir (no Developer Mode or
admin rights needed). If better-sqlite3 has no prebuilt binary for your Node
version, it compiles from source, which requires Visual Studio Build Tools.

## Reporting issues

Open a GitHub issue with: OS + Node version, what you did, what you expected,
what happened. **Never attach your `data/numina.db` or screenshots containing
real balances** — mask amounts first.
