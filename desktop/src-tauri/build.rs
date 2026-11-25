fn main() {
    // Rebuild when `numina install-app` bakes in new absolute paths.
    println!("cargo:rerun-if-env-changed=NUMINA_PROJECT_ROOT");
    println!("cargo:rerun-if-env-changed=NUMINA_NODE_BIN");
    println!("cargo:rerun-if-env-changed=NUMINA_PORT");

    tauri_build::build()
}
