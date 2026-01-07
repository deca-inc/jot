## Local AI

### Use Cases

- Personal, Private AI assistant when creating a convo (a type of journal entry)
- Summarize entries or time ranges.
- Q&A over journal content.
- Generate prompts/reflections; mood and trend insights.

### Models

- On-device small LLM (e.g., Llama 3.2 3B Instruct) via `llama.cpp`/Metal or MLC.
- Optional local embedding model (e.g., MiniLM/all-MiniLM-L6-v2 distilled variant) for semantic search.
- **Download Strategy**: Small initial app download. Models downloaded on-demand with user choice.
  - Present model sizes and trade-offs (performance vs. storage vs. speed)
  - Let users select which models to download
  - Explain performance implications for different Mac hardware
- **Multiple Models Support**: Users can download and keep multiple models simultaneously.
  - Fast models: Smaller, quicker responses for real-time interactions
  - Slow/quality models: Larger, higher-quality responses when speed is less important
  - Users can switch between downloaded models per conversation or globally in settings
  - Storage management: Show disk usage and allow easy model removal

### Retrieval

- Hybrid search: BM25 via FTS5 + vector similarity over embeddings.
- Chunking strategy: sentence/paragraph for entries; per-message for AI conversations.

### Privacy

- All inference on-device. No remote calls unless user opts into a provider.
