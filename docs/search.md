## Search

### Lexical (Implemented)

- FTS5 across entries and AI messages; support prefix, phrase, tag filters, date ranges.

### Semantic (Planned)

_Semantic search is not yet implemented. The following describes the planned strategy:_

- Embedding index built in background. Hybrid scoring: `alpha * lexical + (1-alpha) * vector`.
- RAG pipeline for AI Q&A: retrieve top-k chunks, re-rank, generate.

### UX

- Single omnibar with filters.
- Snippet previews with highlighted terms; jump-to in timeline.
- _Keyboard-first navigation and semantic search tab planned._
