# Numina desktop app

An optional desktop shell that wraps the existing Numina web app in a native
window, so you can launch it from Applications / the Start Menu instead of a
terminal. It is **not** a rewrite: the Next.js server, the SQLite ledger
(`data/numina.db`), and the request guard are exactly the same as the web app.

## What the shell does

The UI is already a web app on loopback. The shell only:

1. starts the same server — `next start -H 127.0.0.1`,
2. shows it in a window instead of a browser tab (via Tauri, using the OS's
   built-in webview — no Chromium is bundled), and
3. stops the server when the window closes.

The window talks to `http://127.0.0.1:3000` like a browser would, so the
loopback binding and `src/lib/server/guard.ts` still apply. The shell makes no
network calls of its own — that's why it uses Tauri (system webview) rather
than bundling Chromium.

## Install

From the project root:

```bash
numina install-app
```

That ensures a production build exists, generates the app icon, runs
`tauri build`, and (on macOS) copies `Numina.app` into `/Applications` (or
`~/Applications` if `/Applications` isn't writable). On Windows it produces an
NSIS installer and prints its path.

Requirements beyond the normal setup:

- **Rust toolchain** — <https://rustup.rs>. Only needed to build the desktop
  app; the web app never requires it. If it's missing, `numina install-app`
  offers to install it for you (opt-in; nothing runs without a `yes`).
- The Tauri CLI is fetched on demand with `pnpm dlx @tauri-apps/cli`, or used
  from `node_modules/.bin/tauri` if you have it installed locally.

## Important: the repo must stay where it is

The app bakes in the absolute path of the project when it's built, because it
launches the server from that checkout. If you move or rename the repo, run
`numina install-app` again. (This is also why the ledger stays at
`<repo>/data/numina.db` — the app and the `numina` CLI must always point at the
same database.)

## Layout

| Path | Purpose |
| --- | --- |
| `src-tauri/src/main.rs` | The shell: spawn/stop the server, open the window |
| `src-tauri/tauri.conf.json` | Window, bundle, and security config |
| `src-tauri/tauri.macos.conf.json` / `tauri.windows.conf.json` | Per-platform bundle targets |
| `src-tauri/capabilities/default.json` | Tauri v2 permissions (minimal; no IPC is used) |
| `ui/index.html` | Local "Starting Numina…" placeholder shown until the server is up |
| `app-icon.png` | 1024×1024 icon source (generated into `src-tauri/icons/` at build time) |

Generated and gitignored: `src-tauri/icons/`, `src-tauri/target/`,
`src-tauri/gen/`.
