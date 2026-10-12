// ReelForge Studio — Tauri Library Crate
//
// This is the main library entry point. It:
//   - Registers all IPC command handlers
//   - Initialises Tauri plugins
//   - Configures logging
//
// Security: no raw shell execution; all child processes use Command::new() with arg arrays.

use tauri::Manager;
use tracing_subscriber::EnvFilter;

pub mod commands;
pub mod media;
pub mod process;
pub mod security;

use commands::media_commands;

/// Called by main.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("reelforge_studio_lib=debug,tauri=warn")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            media_commands::probe_media_file,
            media_commands::generate_thumbnail,
            media_commands::get_ffmpeg_version,
        ])
        .setup(|app| {
            tracing::info!("ReelForge Studio starting (schema v1)");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ReelForge Studio");
}
