#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;

use llm::inference::InferenceEngine;
use llm::{llm_download_model, llm_generate, llm_interrupt, llm_load, llm_unload, LlmState};

fn main() {
    tauri::Builder::default()
        .manage(LlmState(tokio::sync::Mutex::new(InferenceEngine::new())))
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            llm_load,
            llm_generate,
            llm_interrupt,
            llm_unload,
            llm_download_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
