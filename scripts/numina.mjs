#!/usr/bin/env node
// Launcher for `pnpm numina` — also installable as a global `numina` command
// (see the `bin` field in package.json; set up once with `pnpm link --global`).
//
// Commands:
//   numina          start the server (production build if present, dev
//                   otherwise) and open the browser tab
//   numina install  one-time setup: `pnpm install` + production build +
//                   symlink the launcher into pnpm's global bin dir
//   numina dev      force dev mode (same as running `pnpm dev`)
//   numina open     just open the browser tab (errors out if not running)
//   numina stop     stop the running instance (PID lives in .numina.pid)
//   numina build    run the production build (`next build`)
//   numina help     this
//
// Always anchors to this project's root, so it works from any directory.
// No network egress — the only URL touched is the local loopback server.

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

// The project root is this script's parent directory, whatever the caller's cwd.
// That also holds when the script is reached through a symlink (e.g. the global
// `numina` command), so resolve the real path before walking up.
const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const projectRoot = fileURLToPath(new URL("..", "file://" + scriptPath));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", "file://" + scriptPath));
const pidFile = fileURLToPath(new URL("../.numina.pid", "file://" + scriptPath));

const host = "127.0.0.1";
const port = process.env.PORT ?? "3000";
const url = `http://${host}:${port}`;
const argv = process.argv.slice(2).map((arg) => arg.toLowerCase());
const command = argv[0] ?? "start";

const usage = `Usage: numina [command]

commands:
  (default)  start the server (prod build if present, dev otherwise) and open the browser
  install    one-time setup: dependencies + production build + global \`numina\` command
  dev        force dev mode (same as \`pnpm dev\`)
  open       open the browser tab without starting the server
  stop       stop the running instance
  build      run the production build
  help       show this message

The server always binds to ${host} and never leaves this machine.
The ledger lives at ${projectRoot}data/numina.db — back it up by copying the file.`;

function openBrowser() {
  if (platform() === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } else if (platform() === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  } else {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  }
}

async function isUp(attempts = 6, intervalMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await fetch(url, { method: "HEAD" });
      return true;
    } catch {
      // connection refused — not up (yet)
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// Spawns the local next binary directly (no npx wrapper) so the PID we track
// is the actual server process and `numina stop` can take it down cleanly.
function startNext(mode) {
  const server = spawn(process.execPath, [nextBin, mode, "-H", host], {
    stdio: "inherit",
    cwd: projectRoot,
    env: { ...process.env, PORT: port },
  });
  if (typeof server.pid === "number") {
    try {
      writeFileSync(pidFile, String(server.pid));
    } catch {}
  }
  return server;
}

function clearPidFile() {
  try {
    rmSync(pidFile, { force: true });
  } catch {}
}

// Locates pnpm's global bin directory (where `numina` should live so it is
// found from any directory). `pnpm bin -g` only answers when the dir is
// already on PATH, so fall back to PNPM_HOME/bin for the "configured but
// fresh-session" case, and give up with instructions otherwise.
function globalBinDir() {
  const probe = spawnSync("pnpm", ["bin", "-g"], { cwd: projectRoot, encoding: "utf8" });
  if (probe.status === 0) {
    return probe.stdout.trim();
  }
  const home =
    process.env.PNPM_HOME ?? readPnpmHomeFromShellConfig();
  if (home) {
    return platform() === "win32" ? home : `${home}/bin`;
  }
  return null;
}

// `pnpm setup` writes `export PNPM_HOME=…` into a shell config; scan the
// usual suspects so we can find the dir even when this session doesn't
// have it on PATH.
function readPnpmHomeFromShellConfig() {
  const candidates =
    platform() === "win32"
      ? [`${process.env.USERPROFILE}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`]
      : [".zshrc", ".zprofile", ".bashrc", ".bash_profile", ".profile"].map(
          (file) => `${process.env.HOME}/${file}`
        );
  for (const file of candidates) {
    try {
      const match = readFileSync(file, "utf8").match(/PNPM_HOME["=:\s]+["']?([^"'\s]+)/);
      if (match?.[1]) return match[1];
    } catch {}
  }
  return null;
}

function runInstall() {
  if (platform() === "win32") {
    console.error(
      "Windows support for the global link is limited (symlinks need developer mode); " +
      "use `pnpm numina` from the project directory instead."
    );
    process.exit(1);
  }

  console.log("1/3  Installing dependencies (pnpm install)…");
  const install = spawnSync("pnpm", ["install"], { stdio: "inherit", cwd: projectRoot });
  if (install.status !== 0) {
    console.error("pnpm install failed — stopping here.");
    process.exit(install.status ?? 1);
  }

  console.log("2/3  Building the production bundle…");
  const build = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", cwd: projectRoot });
  if (build.status !== 0) {
    console.error("Build failed — the app would still work in dev mode.");
    process.exit(build.status ?? 1);
  }

  console.log("3/3  Linking the global `numina` command…");
  const linkDir = globalBinDir();
  if (!linkDir) {
    console.error(
      'Could not determine pnpm\'s global bin directory. Run `pnpm setup` once,\n' +
      'then run `numina install` again.'
    );
    process.exit(1);
  }

  const linkPath = linkDir + "/numina";
  let alreadyLinked = false;
  try {
    alreadyLinked = realpathSync(linkPath) === scriptPath;
  } catch {}
  if (alreadyLinked) {
    console.log(`Already linked: ${linkPath} -> ${projectRoot}scripts/numina.mjs`);
  } else {
    try {
      mkdirSync(linkDir, { recursive: true });
      rmSync(linkPath, { force: true });
      symlinkSync(scriptPath, linkPath);
      console.log(`Linked ${linkPath} -> ${projectRoot}scripts/numina.mjs`);
    } catch (error) {
      console.error(`Could not create the link (${error.message}).`);
      process.exit(1);
    }
  }

  const onPath = (process.env.PATH ?? "").split(":").includes(linkDir);
  console.log("");
  console.log("Numina is installed.");
  console.log("Run `numina` from any directory to start it and open the browser tab.");
  if (!onPath) {
    console.log("");
    console.log("One more step: the new command may not be found in THIS terminal window.");
    console.log("Open a fresh terminal window — or run `numina help` there to confirm.");
  }
}

async function runStart(mode) {
  if (await isUp()) {
    console.log(`Numina is already running at ${url} — opening the browser.`);
    openBrowser();
    process.exit(0);
  }

  if (mode === "start") {
    try {
      readFileSync(fileURLToPath(new URL("../.next/BUILD_ID", "file://" + scriptPath)));
    } catch {
      // No production build yet — dev mode keeps this working out of the box.
      console.log("No production build found; starting dev mode. Run `numina build` for faster startups.");
      mode = "dev";
    }
  }

  console.log(`Starting Numina (${mode}) at ${url} …`);
  const server = startNext(mode);

  // Forward signals so Ctrl+C behaves normally, and clean up the PID file
  // whenever the server goes away.
  process.on("SIGINT", () => server.kill("SIGINT"));
  process.on("SIGTERM", () => server.kill("SIGTERM"));
  server.on("exit", (code) => {
    clearPidFile();
    process.exit(code ?? 0);
  });

  if (await isUp(120)) {
    openBrowser();
  } else {
    console.error(`Server did not respond at ${url} in time; skipping browser open.`);
  }
}

function runStop() {
  let pid;
  try {
    pid = Number(readFileSync(pidFile, "utf8").trim());
  } catch {
    console.error("No running instance found (.numina.pid is absent).");
    process.exit(1);
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    clearPidFile();
    console.error("PID file was corrupted; removed it.");
    process.exit(1);
  }
  try {
    process.kill(pid, 0);
  } catch {
    // Stale PID file — the server is already gone.
    clearPidFile();
    console.log("No running instance found (PID file was stale); removed it.");
    process.exit(0);
  }

  // SIGTERM is normally enough; if it's still alive after a grace period, SIGKILL.
  process.kill(pid, "SIGTERM");
  console.log(`Stopping Numina (pid ${pid}) …`);
  const startedAt = Date.now();
  const check = setInterval(() => {
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {}
    if (!alive) {
      clearInterval(check);
      clearPidFile();
      console.log("Numina stopped.");
      process.exit(0);
    }
    if (Date.now() - startedAt > 3000) {
      process.kill(pid, "SIGKILL");
    }
  }, 500);
}

switch (command) {
  case "start":
    await runStart("start");
    break;
  case "install":
    runInstall();
    break;
  case "dev":
    await runStart("dev");
    break;
  case "open":
    if (!(await isUp(4))) {
      console.error(`Nothing is running at ${url} — start Numina first with \`numina\`.`);
      process.exit(1);
    }
    openBrowser();
    break;
  case "stop":
    runStop();
    break;
  case "build": {
    console.log("Building Numina (production)…");
    const result = spawnSync(process.execPath, [nextBin, "build"], {
      stdio: "inherit",
      cwd: projectRoot,
    });
    if (result.status !== 0) {
      console.error("Build failed.");
      process.exit(result.status ?? 1);
    }
    console.log(`Build complete. Start with \`numina\` — it will serve the prod build at ${url}.`);
    break;
  }
  case "help":
  case "--help":
  case "-h":
    console.log(usage);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    console.log(usage);
    process.exit(1);
}
