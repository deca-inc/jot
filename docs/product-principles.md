## Product Principles

### The Writing Experience is the Most Important Thing

The typing and writing experience must be exceptional—competitive with the best writing apps in the world (iA Writer, Ulysses, Bear, Craft). This is non-negotiable.

1. **Low Latency**: Keystroke-to-render latency must be imperceptible (<16ms target). The editor should feel instant and responsive, never laggy or sluggish like web-based editors can be.

2. **Focus When You Get in the Zone**: Distraction-free writing mode (full-screen, minimal UI), smooth focus transitions, and no interruptions. The interface gets out of the way so thoughts flow freely.

3. **Excellent Typography and Design**: Beautiful, readable fonts with proper spacing, sizing, and contrast. Meticulously polished UI that feels premium and delightful—not just functional, but a joy to use.

4. **Extremely Flexible - Mix Components Together**: Support rich content mixing—text, images, videos, embeds, code blocks, tables, AI chat threads—seamlessly within a single entry. The editor should be as powerful as Notion over the long haul, but with a much better typing experience.

### Fast to Find Your Content

Search must be comprehensive, fast, and forgiving. Users should be able to find content based on whatever fragments they remember.

1. **Searchable by Whatever You Can Remember**: Full-text search across all content (entries, AI conversations, messages), metadata search (tags, dates, attachments), media search (images, videos), and attachment content indexing. If it's in the app, it should be findable.

2. **Search is Fast So You Can Correct Quickly**: Sub-100ms search results on typical datasets. Instant feedback as you type, allowing rapid query refinement. Keyboard-first navigation through results.

### Privacy First

We are a private personal assistant and journaling app. Privacy is a core feature, not an afterthought.

1. **Your Private Personal Assistant and Journaling App**: We are committed to being a trusted, private space for your thoughts. The app is local-first by default.

2. **Stay at the Frontier of AI**: We aim to leverage cutting-edge AI capabilities while maintaining privacy. This means prioritizing on-device AI models and being transparent about any cloud-based AI features when they're used.

3. **Transparency and Control**: We will be extremely transparent about what data we collect and what we don't. We aim to almost never change our data practices at the detriment of our growth—user privacy comes first.

4. **Privacy Does Not Mean Absolutely No Data Transfer**: Privacy means **predictable** and **transparent** data transfer with user control. We will:
   - Clearly highlight what data transfer is optional vs required
   - Provide granular controls to enable/disable specific types of data transfer
   - Explicitly state what's not on the table to disable (if anything)
   - Make data practices easily discoverable and understandable
   - Default to the most private option, requiring explicit opt-in for any data sharing

### Implementation Implications

These principles mean:

- Optimized Expo/React Native stack for ultra-low latency typing (careful editor component selection, performance tuning, native optimizations where needed)
- Investment in editor technology and typography
- Comprehensive search infrastructure (FTS5, embeddings, media indexing)
- Privacy-by-design architecture (local-first, encrypted, zero-knowledge backups)
- Clear, accessible privacy documentation and controls
