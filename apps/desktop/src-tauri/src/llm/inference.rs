//! Native Rust inference backend for the Jot desktop app.
//!
//! Owns the mistralrs-backed `Model` instance, manages the currently loaded
//! model, and provides streaming generation primitives that the `llm_*`
//! Tauri commands in `mod.rs` call into.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use mistralrs::{
    ChatCompletionChunkResponse, ChunkChoice, Delta, GgufModelBuilder, Model, RequestBuilder,
    Response, TextMessageRole,
};

/// Simple chat message for the inference engine.
#[derive(Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Generation configuration.
#[derive(Clone, Debug, Default)]
pub struct GenerateConfig {
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

/// Inference engine wrapping a loaded mistralrs `Model`.
///
/// At most one model is loaded at a time. Switching models requires
/// calling `unload()` first or is handled by the TS-side engine.
pub struct InferenceEngine {
    model: Option<Arc<Model>>,
    loaded_model_id: Option<String>,
    interrupt_flag: Arc<AtomicBool>,
}

impl Default for InferenceEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl InferenceEngine {
    /// Create an empty engine with no model loaded.
    pub fn new() -> Self {
        Self {
            model: None,
            loaded_model_id: None,
            interrupt_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Returns true if a model is currently loaded.
    #[allow(dead_code)]
    pub fn is_loaded(&self) -> bool {
        self.model.is_some()
    }

    /// Returns the id of the currently loaded model, if any.
    #[allow(dead_code)]
    pub fn loaded_model_id(&self) -> Option<&str> {
        self.loaded_model_id.as_deref()
    }

    /// Load a GGUF model from the given filesystem path.
    ///
    /// `model_path` should point at the `.gguf` file. `_context_size` is
    /// currently accepted for API compatibility; mistralrs infers context
    /// from the model metadata automatically.
    ///
    /// `progress` is called once at the start and once when loading
    /// completes. mistralrs does not expose fine-grained loading progress,
    /// so we synthesize a start/end event.
    pub async fn load<F>(
        &mut self,
        model_path: &str,
        model_id: &str,
        _context_size: u32,
        progress: F,
    ) -> Result<(), String>
    where
        F: Fn(f32, f32, &str),
    {
        // Emit an initial "starting" progress event.
        progress(0.0, 1.0, "loading model");

        // mistralrs's `GgufModelBuilder` expects a directory + list of
        // filenames rather than a full file path. Split the provided path.
        let path = Path::new(model_path);
        let parent = path
            .parent()
            .ok_or_else(|| format!("invalid model path (no parent dir): {model_path}"))?;
        let filename = path
            .file_name()
            .ok_or_else(|| format!("invalid model path (no file name): {model_path}"))?
            .to_string_lossy()
            .to_string();
        let parent_str = parent.to_string_lossy().to_string();

        let model = GgufModelBuilder::new(parent_str, vec![filename])
            .build()
            .await
            .map_err(|e| format!("failed to load model: {e}"))?;

        self.model = Some(Arc::new(model));
        self.loaded_model_id = Some(model_id.to_string());
        self.interrupt_flag.store(false, Ordering::SeqCst);

        progress(1.0, 1.0, "model loaded");
        Ok(())
    }

    /// Generate a chat completion, streaming tokens through `on_token`.
    ///
    /// Returns the full accumulated response text once generation is
    /// complete (or was interrupted).
    pub async fn generate<F>(
        &self,
        messages: Vec<ChatMessage>,
        config: GenerateConfig,
        on_token: F,
    ) -> Result<String, String>
    where
        F: Fn(&str),
    {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| "model not loaded".to_string())?
            .clone();

        // Reset the interrupt flag at the start of each generation.
        self.interrupt_flag.store(false, Ordering::SeqCst);

        let mut request = RequestBuilder::new();
        for msg in messages {
            let role = match msg.role.as_str() {
                "user" => TextMessageRole::User,
                "assistant" => TextMessageRole::Assistant,
                "system" => TextMessageRole::System,
                "tool" => TextMessageRole::Tool,
                other => TextMessageRole::Custom(other.to_string()),
            };
            request = request.add_message(role, msg.content);
        }

        if let Some(temp) = config.temperature {
            request = request.set_sampler_temperature(temp as f64);
        }
        if let Some(max_tokens) = config.max_tokens {
            request = request.set_sampler_max_len(max_tokens as usize);
        }

        let mut stream = model
            .stream_chat_request(request)
            .await
            .map_err(|e| format!("failed to start generation: {e}"))?;

        let mut accumulated = String::new();
        while let Some(response) = stream.next().await {
            if self.interrupt_flag.load(Ordering::SeqCst) {
                break;
            }
            if let Response::Chunk(ChatCompletionChunkResponse { choices, .. }) = response {
                if let Some(ChunkChoice {
                    delta:
                        Delta {
                            content: Some(content),
                            ..
                        },
                    ..
                }) = choices.first()
                {
                    on_token(content);
                    accumulated.push_str(content);
                }
            }
        }

        Ok(accumulated)
    }

    /// Signal the current generation loop to stop at the next token.
    pub fn interrupt(&self) {
        self.interrupt_flag.store(true, Ordering::SeqCst);
    }

    /// Drop the loaded model, freeing GPU/CPU memory.
    pub fn unload(&mut self) {
        self.model = None;
        self.loaded_model_id = None;
        self.interrupt_flag.store(false, Ordering::SeqCst);
    }
}
