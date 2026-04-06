//! LLM inference module for the Jot desktop app.
//!
//! Exposes Tauri commands that drive native Rust inference (mistralrs) with
//! streaming via Tauri Channels. The TypeScript side calls these commands
//! through `@tauri-apps/api`'s `invoke()` and subscribes to Channels for
//! progress and token streaming.

pub mod inference;

use std::path::Path;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;
use tokio::fs;
use tokio::io::AsyncWriteExt;

use inference::{ChatMessage, GenerateConfig, InferenceEngine};

/// Progress event emitted during model loading.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub loaded: f32,
    pub total: f32,
    pub text: String,
}

/// Token event emitted during generation.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenEvent {
    pub token: String,
}

/// Progress event emitted while streaming a model file to disk.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub loaded: u64,
    pub total: u64,
    pub done: bool,
}

/// Chat message passed from the TS side.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageArg {
    pub role: String,
    pub content: String,
}

/// Shared inference engine state managed by Tauri.
///
/// Wrapped in an async `tokio::sync::Mutex` because commands run in an async
/// context and loading a model is a long-running operation we don't want
/// to block the Tokio runtime on.
pub struct LlmState(pub tokio::sync::Mutex<InferenceEngine>);

/// Load a GGUF model from disk.
///
/// Streams progress updates through `on_progress` as the model is mapped /
/// initialized. Resolves once the model is ready for inference.
#[tauri::command]
pub async fn llm_load(
    model_path: String,
    model_id: String,
    context_size: Option<u32>,
    on_progress: Channel<ProgressEvent>,
    state: State<'_, LlmState>,
) -> Result<(), String> {
    let mut engine = state.0.lock().await;
    let ctx = context_size.unwrap_or(4096);

    let progress_cb = |loaded: f32, total: f32, text: &str| {
        let _ = on_progress.send(ProgressEvent {
            loaded,
            total,
            text: text.to_string(),
        });
    };

    engine
        .load(&model_path, &model_id, ctx, progress_cb)
        .await?;
    Ok(())
}

/// Generate a chat completion from the currently loaded model.
///
/// Streams tokens through `on_token` as they are sampled, and resolves with
/// the full accumulated response once generation completes.
#[tauri::command]
pub async fn llm_generate(
    messages: Vec<ChatMessageArg>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    on_token: Channel<TokenEvent>,
    state: State<'_, LlmState>,
) -> Result<String, String> {
    let engine = state.0.lock().await;

    let chat_messages: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
        })
        .collect();

    let config = GenerateConfig {
        max_tokens,
        temperature,
    };

    let token_cb = |token: &str| {
        let _ = on_token.send(TokenEvent {
            token: token.to_string(),
        });
    };

    engine.generate(chat_messages, config, token_cb).await
}

/// Interrupt any in-flight generation.
///
/// No-op when nothing is generating.
#[tauri::command]
pub async fn llm_interrupt(state: State<'_, LlmState>) -> Result<(), String> {
    let engine = state.0.lock().await;
    engine.interrupt();
    Ok(())
}

/// Unload the currently loaded model, releasing all associated memory.
///
/// No-op when nothing is loaded.
#[tauri::command]
pub async fn llm_unload(state: State<'_, LlmState>) -> Result<(), String> {
    let mut engine = state.0.lock().await;
    engine.unload();
    Ok(())
}

/// Throttle progress events to at most one per ~64KiB or 100ms, whichever
/// comes first. Sending one event per chunk would flood the IPC channel.
const PROGRESS_BYTES_THRESHOLD: u64 = 64 * 1024;
const PROGRESS_MS_THRESHOLD: u128 = 100;

/// Stream a GGUF model file from `url` to `dest_path` on disk.
///
/// Creates the parent directory if missing, downloads the file to a
/// temporary `.part` sibling, and renames it into place on success so we
/// never leave a truncated `.gguf` file sitting at the destination.
///
/// Skips the download entirely if a file already exists at `dest_path`
/// (we do not currently verify checksums — that's a future enhancement).
///
/// Progress is streamed through `on_progress` and is throttled: at most
/// one event per 64KiB of body written or 100ms of wall time.
#[tauri::command]
pub async fn llm_download_model(
    url: String,
    dest_path: String,
    on_progress: Channel<DownloadProgressEvent>,
) -> Result<(), String> {
    let dest = Path::new(&dest_path);

    // Short-circuit: file already complete on disk.
    if fs::try_exists(dest).await.unwrap_or(false) {
        let _ = on_progress.send(DownloadProgressEvent {
            loaded: 1,
            total: 1,
            done: true,
        });
        return Ok(());
    }

    // Create parent directory tree if missing.
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("failed to create model directory: {e}"))?;
    }

    // Stream GET request.
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("failed to connect to {url}: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {}: failed to download {url}", status.as_u16()));
    }

    let total = response.content_length().unwrap_or(0);

    // Write to a `.part` file so an interrupted download never masquerades
    // as a complete one.
    let part_path = {
        let mut p = dest.to_path_buf();
        let extra_ext = match p.extension().and_then(|s| s.to_str()) {
            Some(ext) => format!("{ext}.part"),
            None => "part".to_string(),
        };
        p.set_extension(extra_ext);
        p
    };

    let mut file = fs::File::create(&part_path)
        .await
        .map_err(|e| format!("failed to open {}: {e}", part_path.display()))?;

    let mut loaded: u64 = 0;
    let mut last_emitted_bytes: u64 = 0;
    let mut last_emitted_at = std::time::Instant::now();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("network error while downloading: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("failed to write chunk: {e}"))?;
        loaded += chunk.len() as u64;

        let bytes_since = loaded.saturating_sub(last_emitted_bytes);
        let ms_since = last_emitted_at.elapsed().as_millis();
        if bytes_since >= PROGRESS_BYTES_THRESHOLD || ms_since >= PROGRESS_MS_THRESHOLD {
            let _ = on_progress.send(DownloadProgressEvent {
                loaded,
                total,
                done: false,
            });
            last_emitted_bytes = loaded;
            last_emitted_at = std::time::Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("failed to flush download: {e}"))?;
    drop(file);

    fs::rename(&part_path, dest)
        .await
        .map_err(|e| format!("failed to finalize download: {e}"))?;

    let _ = on_progress.send(DownloadProgressEvent {
        loaded,
        total: if total > 0 { total } else { loaded },
        done: true,
    });

    Ok(())
}
