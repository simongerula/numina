# Numina

A private, **local-first** money tracker. Track accounts, log deposits / withdrawals /
adjustments, and see your balances, profits and balance-over-time in one dashboard.

**All your data stays on your machine.** There is no cloud, no login, no telemetry —
just a single SQLite file that lives on your computer.

```
┌─────────────────────────────────────────────────┐
│  Balance-over-time chart (line / bar, 6m / all) │
│  Balances & profits table per account           │
│  Excel-style editable ledger                    │
│    Period │ Date │ Account │ Type │ Amount │ Note │
└─────────────────────────────────────────────────┘
```

## Quick start

```bash
pnpm install
pnpm dev
```

Open **http://127.0.0.1:3000** — that's it. The database is created automatically
at `data/numina.db` on first run.

## How it works

| Layer | Tech |
|-------|------|
| UI | Next.js (App Router) + React + Tailwind + shadcn/ui |
| Charts | Recharts |
| Storage | SQLite (better-sqlite3), file at `data/numina.db` |
| API | Next.js Route Handlers (`/api/accounts`, `/api/movements`) |
| Validation | Zod on every write |

- Money is stored as **integer cents** — no floating-point rounding surprises.
- All SQL is **prepared and parameterized**.
- The HTTP API only accepts writes from the loopback interface with a
  matching `Origin` (see [Security](#security) below).
- The dev server binds to `127.0.0.1` only — it is unreachable from the network.

## Security

Numina is designed for a local, single-user context and hardens accordingly:

1. **Loopback-only binding** — `next dev -H 127.0.0.1` / `next start -H 127.0.0.1`.
2. **Host allow-list** — every `/api/*` request must target `127.0.0.1`,
   `localhost` or `[::1]` (defeats DNS-rebinding).
3. **Origin check** — writes (POST/PATCH/DELETE) must carry an `Origin` equal to
   the request host (defeats cross-site requests to your local server).
4. **Strict CSP** — no external scripts, styles, frames or connections
   (`next.config.ts`).
5. **Validated inputs** — every write is parsed with Zod before touching the DB.
6. **Hide-balances toggle** — obscure all amounts on-screen with one click.

## Your data

- `data/numina.db` — a single SQLite file, **gitignored**, never leaves the machine.
- To back up: copy the file. To start over: delete it.
- Rows: `accounts` (name, color, sort order) and `movements`
  (date, type ∈ deposit/withdraw/adjustment, amount, note).

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run locally on http://127.0.0.1:3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build (loopback only) |
| `pnpm lint` | ESLint |

## License

MIT
