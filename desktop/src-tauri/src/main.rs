// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Numina desktop shell.
//!
//! This is deliberately thin. Numina's UI is already a local web app served on
//! loopback by Next.js, so the desktop app only has to:
//!
//!   1. start that same server (`next start -H 127.0.0.1`),
//!   2. show it in a window instead of a browser tab, and
//!   3. stop the server when the window closes.
//!
//! The server, its SQLite ledger, and the request guard are untouched: the
//! window talks to `http://127.0.0.1:<port>` exactly like a browser would, so
//! the loopback binding and `lib/server/guard.ts` still apply. The shell makes
//! no network calls of its own.

use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};

/// Default loopback port. Matches `pnpm start` and the README.
const DEFAULT_PORT: u16 = 3000;

/// Absolute paths baked in at build time by `numina install-app`.
/// `option_env!` (not `env!`) keeps `cargo check` working before they are set.
const PROJECT_ROOT: Option<&str> = option_env!("NUMINA_PROJECT_ROOT");
const NODE_BIN: Option<&str> = option_env!("NUMINA_NODE_BIN");
const PORT_OVERRIDE: Option<&str> = option_env!("NUMINA_PORT");

/// Shared handle to the child server, reachable from both the exit hook and
/// the "server died" watcher thread.
#[derive(Clone)]
struct Server {
    child: Arc<Mutex<Option<Child>>>,
}

fn port() -> u16 {
    PORT_OVERRIDE
        .and_then(|value| value.parse::<u16>().ok())
        .or_else(|| std::env::var("PORT").ok().and_then(|value| value.parse::<u16>().ok()))
        .unwrap_or(DEFAULT_PORT)
}

fn app_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Is anything already answering on the loopback port?
fn server_up(port: u16) -> bool {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    TcpStream::connect_timeout(&addr.into(), Duration::from_millis(400)).is_ok()
}

/// Starts the production server straight from Node, so the process we track is
/// the server itself and we can take it down (and its tree) cleanly.
fn spawn_server(port: u16) -> std::io::Result<Child> {
    let root = PROJECT_ROOT
        .expect("NUMINA_PROJECT_ROOT is missing — rebuild the app with `numina install-app`.");
    let node = NODE_BIN.unwrap_or("node");
    let next_bin = format!("{root}/node_modules/next/dist/bin/next");

    let mut command = Command::new(node);
    command
        .arg(next_bin)
        .arg("start")
        .arg("-H")
        .arg("127.0.0.1")
        .current_dir(root)
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // Give the child its own process group so a single signal reaches the
    // whole tree (Node plus anything it spawns).
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }

    command.spawn()
}

fn stop_server(server: &Server) {
    let child = match server.child.lock() {
        Ok(mut guard) => guard.take(),
        Err(poisoned) => poisoned.into_inner().take(),
    };
    if let Some(mut child) = child {
        terminate(&mut child);
    }
}

#[cfg(unix)]
fn terminate(child: &mut Child) {
    let pid = child.id() as i32;
    // A negative pid targets the whole process group.
    unsafe { libc::kill(-pid, libc::SIGTERM) };
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(80)),
            Err(_) => break,
        }
    }
    unsafe { libc::kill(-pid, libc::SIGKILL) };
    let _ = child.wait();
}

#[cfg(windows)]
fn terminate(child: &mut Child) {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill").args(["/PID", &pid, "/T", "/F"]).status();
    let _ = child.wait();
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let port = port();

    // If the CLI (or a previous launch) is already serving on this port, don't
    // start a second server — just point the window at the running one.
    let child = if server_up(port) { None } else { Some(spawn_server(port)?) };

    let server = Server { child: Arc::new(Mutex::new(child)) };
    app.manage(server.clone());

    // Wait for the server to answer, then swap the window from the local
    // placeholder to the running app.
    let handle = app.handle().clone();
    let watch = server.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(90);
        while Instant::now() < deadline && !server_up(port) {
            std::thread::sleep(Duration::from_millis(300));
        }

        let navigator = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(window) = navigator.get_webview_window("main") {
                if let Ok(url) = tauri::Url::parse(&app_url(port)) {
                    let _ = window.navigate(url);
                }
                let _ = window.show();
                let _ = window.set_focus();
            }
        });

        // Quit the app if the server dies underneath it (crash, or `numina stop`).
        loop {
            std::thread::sleep(Duration::from_millis(800));
            let gone = {
                let mut guard = match watch.child.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };
                match guard.as_mut() {
                    None => return, // we stopped it ourselves
                    Some(child) => matches!(child.try_wait(), Ok(Some(_)) | Err(_)),
                }
            };
            if gone {
                handle.exit(0);
                return;
            }
        }
    });

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| setup(app))
        .on_window_event(|window, event| {
            // Single-window app: closing the window shuts everything down,
            // which then stops the server (see RunEvent::Exit below).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Numina desktop app")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                let server = handle.state::<Server>();
                stop_server(server.inner());
            }
        });
}
