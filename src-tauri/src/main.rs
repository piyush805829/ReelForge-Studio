// ReelForge Studio — Tauri Main Entry
// Delegates to the library crate.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    reelforge_studio_lib::run()
}
