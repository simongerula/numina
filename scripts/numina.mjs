#!/usr/bin/env node
// Launcher for `pnpm numina`: starts the dev server (loopback-bound, same
// flags as `pnpm dev`) and opens the browser once it responds.
// No network egress — the only URL touched is the local server itself.

import { spawn } from "node:child_process";
import { platform } from "node:os";

const host = "127.0.0.1";
const port = process.env.PORT ?? "3000";
const url = `http://${host}:${port}`;

const server = spawn("npx", ["next", "dev", "-H", host], {
  stdio: "inherit",
  env: { ...process.env, PORT: port },
});

function cleanup() {
  // Forward the interrupt to the dev server so Ctrl+C behaves normally.
  server.kill("SIGINT");
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
server.on("exit", (code) => process.exit(code ?? 0));

// Poll until the server answers anything at all (any HTTP status counts;
// connection refused throws), then open a browser tab at the app.
async function waitUntilUp() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await fetch(url, { method: "HEAD" });
      return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const up = await waitUntilUp();
if (!up) {
  console.error(`Server did not respond at ${url} in time; skipping browser open.`);
} else if (platform() === "darwin") {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
} else if (platform() === "win32") {
  spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
} else {
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}
