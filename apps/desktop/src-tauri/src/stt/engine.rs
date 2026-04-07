//! Native Rust speech-to-text backend for the Jot desktop app.
//!
//! Owns a whisper-rs `WhisperContext` instance, manages the currently loaded
//! whisper model, and provides transcription primitives that the `stt_*`
//! Tauri commands in `mod.rs` call into.

use std::time::Instant;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::TranscriptionResult;

/// Speech-to-text engine wrapping a loaded whisper-rs `WhisperContext`.
///
/// At most one model is loaded at a time. Switching models requires
/// calling `unload()` first or is handled automatically by the TS-side engine.
pub struct WhisperEngine {
    context: Option<WhisperContext>,
    loaded_model_id: Option<String>,
}

impl Default for WhisperEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl WhisperEngine {
    /// Create an empty engine with no model loaded.
    pub fn new() -> Self {
        Self {
            context: None,
            loaded_model_id: None,
        }
    }

    /// Returns true if a model is currently loaded.
    #[allow(dead_code)]
    pub fn is_loaded(&self) -> bool {
        self.context.is_some()
    }

    /// Returns the id of the currently loaded model, if any.
    #[allow(dead_code)]
    pub fn loaded_model_id(&self) -> Option<&str> {
        self.loaded_model_id.as_deref()
    }

    /// Load a whisper model from the given filesystem path.
    ///
    /// `model_path` should point at the whisper.cpp model file (`.bin` format).
    pub fn load(&mut self, model_path: &str, model_id: &str) -> Result<(), String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(model_path, params)
            .map_err(|e| format!("Failed to load whisper model: {e}"))?;
        self.context = Some(ctx);
        self.loaded_model_id = Some(model_id.to_string());
        Ok(())
    }

    /// Transcribe PCM 16kHz mono float32 audio samples into text.
    ///
    /// Returns a `TranscriptionResult` with the transcribed text and the
    /// wall-clock duration of the transcription in milliseconds.
    pub fn transcribe(
        &self,
        audio: &[f32],
        language: Option<&str>,
    ) -> Result<TranscriptionResult, String> {
        let ctx = self
            .context
            .as_ref()
            .ok_or_else(|| "No whisper model loaded".to_string())?;

        let start = Instant::now();

        let mut state = ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {e}"))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        if let Some(lang) = language {
            params.set_language(Some(lang));
        }
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, audio)
            .map_err(|e| format!("Transcription failed: {e}"))?;

        let num_segments = state.full_n_segments();

        let mut text = String::new();
        for i in 0..num_segments {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(segment_text) = segment.to_str_lossy() {
                    text.push_str(&segment_text);
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(TranscriptionResult {
            text: text.trim().to_string(),
            duration_ms,
        })
    }

    /// Drop the loaded model, freeing all associated memory.
    pub fn unload(&mut self) {
        self.context = None;
        self.loaded_model_id = None;
    }
}
