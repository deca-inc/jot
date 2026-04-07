//! Speech-to-text module for the Jot desktop app.
//!
//! Exposes Tauri commands that drive native Rust transcription (whisper-rs)
//! via whisper.cpp. The TypeScript side calls these commands through
//! `@tauri-apps/api`'s `invoke()`.

pub mod engine;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use engine::WhisperEngine;

/// Result of a transcription operation.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
}

/// Shared whisper engine state managed by Tauri.
///
/// Wrapped in an async `tokio::sync::Mutex` because commands run in an async
/// context and loading a model is a blocking operation we don't want to
/// block the Tokio runtime on.
pub struct SttState(pub tokio::sync::Mutex<WhisperEngine>);

/// Load a whisper model from disk.
///
/// Streams progress updates through `on_progress` as the model is loaded.
/// Resolves once the model is ready for transcription.
#[tauri::command]
pub async fn stt_load(
    model_path: String,
    model_id: String,
    on_progress: Channel<super::llm::ProgressEvent>,
    state: State<'_, SttState>,
) -> Result<(), String> {
    let mut engine = state.0.lock().await;

    // Emit an initial "starting" progress event.
    let _ = on_progress.send(super::llm::ProgressEvent {
        loaded: 0.0,
        total: 1.0,
        text: "loading whisper model".to_string(),
    });

    // whisper model loading is a blocking CPU operation — run it on the
    // blocking thread pool so we don't starve the Tokio runtime.
    let path = model_path.clone();
    let id = model_id.clone();
    let result = tokio::task::block_in_place(|| engine.load(&path, &id));
    result?;

    let _ = on_progress.send(super::llm::ProgressEvent {
        loaded: 1.0,
        total: 1.0,
        text: "whisper model loaded".to_string(),
    });

    Ok(())
}

/// Transcribe PCM 16kHz mono float32 audio samples into text.
///
/// `audio_data` is a Vec of f32 samples at 16kHz mono. The TypeScript side
/// must convert recorded audio to this format before calling this command.
#[tauri::command]
pub async fn stt_transcribe(
    audio_data: Vec<f32>,
    language: Option<String>,
    state: State<'_, SttState>,
) -> Result<TranscriptionResult, String> {
    let engine = state.0.lock().await;

    // Transcription is a blocking CPU operation — run it on the blocking
    // thread pool.
    let lang = language.clone();
    tokio::task::block_in_place(|| engine.transcribe(&audio_data, lang.as_deref()))
}

/// Unload the currently loaded whisper model, releasing all associated memory.
///
/// No-op when nothing is loaded.
#[tauri::command]
pub async fn stt_unload(state: State<'_, SttState>) -> Result<(), String> {
    let mut engine = state.0.lock().await;
    engine.unload();
    Ok(())
}
