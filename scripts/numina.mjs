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
//   numina install-app  build + install the optional desktop app (Tauri)
//   numina app      launch the installed desktop app
//   numina help     this
//
// Always anchors to this project's root, so it works from any directory.
// No network egress — the only URL touched is the local loopback server.

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

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
  install-app  build + install the optional desktop app (needs Rust)
  app        launch the installed desktop app
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
  const probe = spawnSync("pnpm", ["bin", "-g"], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: platform() === "win32", // pnpm is pnpm.cmd there; needs a shell to resolve
  });
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
  console.log("1/3  Installing dependencies (pnpm install)…");
  const install = spawnSync("pnpm", ["install"], {
    stdio: "inherit",
    cwd: projectRoot,
    shell: platform() === "win32", // pnpm is pnpm.cmd there; needs a shell to resolve
  });
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

  if (platform() === "win32") {
    // Windows: symlinks need Developer Mode or admin rights, so write a .cmd
    // shim instead — the same approach npm and pnpm use for their own bins.
    const shimPath = path.join(linkDir, "numina.cmd");
    const shim = `@echo off\r\nnode "${path.join(projectRoot, "scripts", "numina.mjs")}" %*\r\n`;
    try {
      if (readFileSync(shimPath, "utf8") === shim) {
        console.log(`Already linked: ${shimPath}`);
        return;
      }
    } catch {}
    try {
      mkdirSync(linkDir, { recursive: true });
      writeFileSync(shimPath, shim);
      console.log(`Linked ${shimPath} -> ${path.join(projectRoot, "scripts", "numina.mjs")}`);
    } catch (error) {
      console.error(`Could not write the shim (${error.message}).`);
      process.exit(1);
    }
  } else {
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
  }

  const pathSeparator = platform() === "win32" ? ";" : ":";
  const onPath = (process.env.PATH ?? "").split(pathSeparator).includes(linkDir);
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

// The optional Tauri desktop app lives in ./desktop. These helpers build and
// install it, and launch it once installed. The app is strictly a shell around
// the same loopback server — see desktop/README.md.

function desktopDir() {
  return fileURLToPath(new URL("../desktop", "file://" + scriptPath));
}

// Prefer a locally installed Tauri CLI; otherwise fetch it on demand. Returns
// { cmd, prefix } to be spawned with the subcommand appended.
function tauriCommand() {
  const local = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    platform() === "win32" ? "tauri.cmd" : "tauri"
  );
  if (existsSync(local)) return { cmd: local, prefix: [] };
  return { cmd: "pnpm", prefix: ["dlx", "@tauri-apps/cli@^2"] };
}

// Where to copy Numina.app: /Applications when writable, else ~/Applications.
function macAppDest() {
  try {
    accessSync("/Applications", constants.W_OK);
    return "/Applications/Numina.app";
  } catch {
    return path.join(process.env.HOME, "Applications", "Numina.app");
  }
}

// Locates a usable `cargo`: whatever is on PATH, else rustup's default install
// location (which may exist even before PATH picks it up).
function findCargo() {
  const isWindows = platform() === "win32";
  const binName = isWindows ? "cargo.exe" : "cargo";
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const candidates = [binName];
  if (home) candidates.push(path.join(home, ".cargo", "bin", binName));

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      shell: isWindows && candidate === binName, // resolve cargo.exe via the shell
    });
    if (probe.status === 0) {
      return {
        version: probe.stdout.trim(),
        // Only needed when cargo was found off-PATH: the Tauri build must be
        // able to find it too (see the PATH injection in runInstallApp).
        dir: path.isAbsolute(candidate) ? path.dirname(candidate) : null,
      };
    }
  }
  return null;
}

const RUST_MANUAL =
  "Rust is not installed. Install it from https://rustup.rs, then run\n" +
  "`numina install-app` again. (Only the desktop app needs Rust — the web\n" +
  "app does not.)";

// Asks once whether to install Rust, then runs the official rustup installer.
// Returns true only if an install ran successfully. Non-interactive runs
// (pipes, CI) never prompt — they just print the manual instructions.
async function offerRustInstall() {
  if (!process.stdin.isTTY) {
    console.error(RUST_MANUAL);
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer = "";
  try {
    answer = (
      await rl.question("     Rust is missing — install it now? [y/N] ")
    )
      .trim()
      .toLowerCase();
  } catch {
    // Ctrl+D / EOF at the prompt — treat as "no".
    answer = "";
  }
  rl.close();

  if (answer !== "y" && answer !== "yes") {
    console.error(RUST_MANUAL);
    return false;
  }

  console.log("     Installing Rust via rustup (this downloads the toolchain)...");
  if (installRust()) return true;

  console.error(`     Rust installation failed.\n${RUST_MANUAL}`);
  return false;
}

function installRust() {
  if (platform() === "win32") {
    // Windows has no curl|sh one-liner; download rustup-init and run it.
    const script = [
      "$ProgressPreference='SilentlyContinue';",
      "Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile \"$env:TEMP\\rustup-init.exe\";",
      "& \"$env:TEMP\\rustup-init.exe\" -y --default-toolchain stable",
    ].join(" ");
    return spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "inherit" }).status === 0;
  }
  // macOS / Linux: rustup's documented one-liner, non-interactive (-y).
  const install = spawnSync(
    "sh",
    [
      "-c",
      "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable",
    ],
    { stdio: "inherit" }
  );
  return install.status === 0;
}

async function runInstallApp() {
  const desktop = desktopDir();

  // 1/4 — the app serves the production build (`next start`), so it must exist.
  const buildIdPath = fileURLToPath(new URL("../.next/BUILD_ID", "file://" + scriptPath));
  let hasBuild = true;
  try {
    readFileSync(buildIdPath);
  } catch {
    hasBuild = false;
  }
  if (hasBuild) {
    console.log("1/4  Using the existing production build (run `numina build` to refresh it).");
  } else {
    console.log("1/4  Building the production bundle (none found)...");
    const build = spawnSync(process.execPath, [nextBin, "build"], {
      stdio: "inherit",
      cwd: projectRoot,
    });
    if (build.status !== 0) {
      console.error("Build failed.");
      process.exit(build.status ?? 1);
    }
  }

  // 2/4 — the Rust toolchain; only the desktop app needs it. If it's missing,
  // offer to install it once (opt-in — nothing is installed without a "yes").
  console.log("2/4  Checking the Rust toolchain...");
  let cargo = findCargo();
  if (!cargo) {
    if (!(await offerRustInstall())) process.exit(1);
    cargo = findCargo();
    if (!cargo) {
      console.error(
        "Rust was installed but `cargo` still isn't found. Open a new terminal,\n" +
        "then run `numina install-app` again."
      );
      process.exit(1);
    }
  }
  console.log(`     ${cargo.version}`);

  // 3/4 — generate icons, then build the Tauri bundle.
  const tauri = tauriCommand();
  const runTauri = (args, env) =>
    spawnSync(tauri.cmd, [...tauri.prefix, ...args], {
      stdio: "inherit",
      cwd: desktop,
      shell: platform() === "win32",
      env: env ?? process.env,
    });

  console.log("3/4  Generating the app icon...");
  const icon = runTauri(["icon", "app-icon.png"]);
  if (icon.status !== 0) {
    console.error("Icon generation failed.");
    process.exit(icon.status ?? 1);
  }

  console.log("     Building the desktop bundle (first run compiles Rust; this takes a while)...");
  const buildEnv = {
    ...process.env,
    // Baked into the binary so the app knows where the server and Node live.
    NUMINA_PROJECT_ROOT: projectRoot,
    NUMINA_NODE_BIN: process.execPath,
  };
  // A just-installed rustup toolchain isn't on this process's PATH yet, but the
  // Tauri build spawns cargo itself — so make sure it can find one.
  if (cargo.dir) {
    const separator = platform() === "win32" ? ";" : ":";
    const pathKey = Object.keys(buildEnv).find((key) => key.toLowerCase() === "path") ?? "PATH";
    buildEnv[pathKey] = `${cargo.dir}${separator}${buildEnv[pathKey] ?? ""}`;
  }
  const built = runTauri(["build"], buildEnv);
  if (built.status !== 0) {
    console.error("Desktop build failed.");
    process.exit(built.status ?? 1);
  }

  // 4/4 — put the app where the user can launch it.
  console.log("4/4  Installing...");
  if (platform() === "darwin") {
    const appPath = path.join(
      desktop,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      "Numina.app"
    );
    if (!existsSync(appPath)) {
      console.error(`Expected bundle not found at ${appPath}.`);
      process.exit(1);
    }
    const dest = macAppDest();
    mkdirSync(path.dirname(dest), { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    cpSync(appPath, dest, { recursive: true, verbatimSymlinks: true });
    console.log(`     Copied Numina.app to ${dest}.`);
    console.log("     Launch it from Applications or Spotlight — no terminal needed.");
  } else if (platform() === "win32") {
    const nsisDir = path.join(desktop, "src-tauri", "target", "release", "bundle", "nsis");
    const installer = existsSync(nsisDir)
      ? readdirSync(nsisDir).find((name) => name.toLowerCase().endsWith(".exe"))
      : undefined;
    if (!installer) {
      console.error(`Expected an NSIS installer in ${nsisDir}.`);
      process.exit(1);
    }
    console.log(`     Installer ready: ${path.join(nsisDir, installer)}`);
    console.log("     Run it to install Numina, then launch it from the Start Menu.");
  } else {
    console.log("     Desktop bundles are set up for macOS and Windows — see desktop/README.md.");
  }

  console.log("");
  console.log("Keep this repo where it is: the app launches the server from this checkout.");
}

function runOpenApp() {
  if (platform() === "darwin") {
    const result = spawnSync("open", ["-a", "Numina"], { stdio: "inherit" });
    if (result.status !== 0) {
      console.error("Could not launch Numina. Install it first with `numina install-app`.");
      process.exit(1);
    }
  } else if (platform() === "win32") {
    spawn("cmd", ["/c", "start", "", "Numina"], { stdio: "ignore", detached: true }).unref();
  } else {
    console.error("`numina app` is set up for macOS and Windows only.");
    process.exit(1);
  }
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
  case "install-app":
    await runInstallApp();
    break;
  case "app":
    runOpenApp();
    break;
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
