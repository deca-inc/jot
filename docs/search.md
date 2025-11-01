## Search

### Lexical
- FTS5 across entries and AI messages; support prefix, phrase, tag filters, date ranges.

### Semantic
- Embedding index built in background. Hybrid scoring: `alpha * lexical + (1-alpha) * vector`.
- RAG pipeline for AI Q&A: retrieve top-k chunks, re-rank, generate.

### UX
- Single omnibar with tabs: All, Semantic, Filters. Keyboard-first navigation.
- Snippet previews with highlighted terms; jump-to in timeline.
