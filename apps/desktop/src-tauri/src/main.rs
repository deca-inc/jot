#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod stt;

use llm::inference::InferenceEngine;
use llm::{llm_download_model, llm_generate, llm_interrupt, llm_load, llm_model_exists, llm_unload, LlmState};
use stt::engine::WhisperEngine;
use stt::{stt_load, stt_transcribe, stt_unload, SttState};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(LlmState(tokio::sync::Mutex::new(InferenceEngine::new())))
        .manage(SttState(tokio::sync::Mutex::new(WhisperEngine::new())))
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_menu = Submenu::with_items(
                app,
                "Jot",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Jot"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, Some("Services"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("Hide Jot"))?,
                    &PredefinedMenuItem::hide_others(app, Some("Hide Others"))?,
                    &PredefinedMenuItem::show_all(app, Some("Show All"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit Jot"))?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("Undo"))?,
                    &PredefinedMenuItem::redo(app, Some("Redo"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("Cut"))?,
                    &PredefinedMenuItem::copy(app, Some("Copy"))?,
                    &PredefinedMenuItem::paste(app, Some("Paste"))?,
                    &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                ],
            )?;

            let reload_item =
                MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
            let view_menu = Submenu::with_items(app, "View", true, &[&reload_item])?;

            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some("Minimize"))?,
                    &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, Some("Close"))?,
                ],
            )?;

            let menu =
                Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &window_menu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "reload" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.location.reload()");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            llm_load,
            llm_generate,
            llm_interrupt,
            llm_unload,
            llm_download_model,
            llm_model_exists,
            stt_load,
            stt_transcribe,
            stt_unload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
