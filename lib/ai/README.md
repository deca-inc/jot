# AI System

This module provides on-device AI model generation with persistent background downloads.

## Architecture

The implementation is split into layers:

### Core Services

1. **`UnifiedModelProvider` component** (`UnifiedModelProvider.tsx`) - Unified model context
   - Keeps a single LLM instance mounted at the app level (prevents OOM)
   - Handles both LLM and Speech-to-Text model loading via `react-native-executorch`
   - Provides `useLLMContext()` and `useModel()` hooks for components
   - Manages background task registration
   - Verifies downloaded models still exist on disk
   - Cleans up stale download state

2. **`useAIChat` hook** (`useAIChat.ts`) - Simple hook for AI chat
   - Uses the shared LLM from `UnifiedModelProvider`
   - Handles message history and callbacks for a single conversation
   - Auto-saves responses to database even if component unmounts during generation

3. **`useSpeechToText` hook** (`useSpeechToText.ts`) - Speech-to-text transcription
   - Uses Whisper models via `react-native-executorch`
   - Chunked recording for live transcription preview
   - Returns audio file URI for saving as attachment

### Download Management

4. **`persistentDownloadManager`** (`persistentDownloadManager.ts`) - Handles resumable downloads
   - Downloads persist across app sessions using `expo-secure-store`
   - Automatic resumption after interruption
   - Background download support (iOS & Android native downloads)
   - Automatic cleanup of old downloads (>7 days)
   - Uses `expo-file-system`'s `DownloadResumable` API

5. **`modelDownloadStatus`** (`modelDownloadStatus.ts`) - Download status tracking
   - Reactive download progress updates via subscription pattern
   - Persists download state across app restarts
   - UI components can subscribe for real-time updates

6. **`modelVerification`** (`modelVerification.ts`) - Model file verification
   - Verifies model files exist on disk
   - Detects if models were cleared by Android
   - Auto-cleans database entries for missing models
   - Logs storage debug info on startup

### Context Management

7. **`contextManager`** (`contextManager.ts`) - Context window limits
   - Token estimation (heuristic-based, no tokenizer needed)
   - Context truncation to fit within model limits
   - Used by LLMProvider to prepare messages before generation

### Background Downloads

Downloads use native OS capabilities:

- **iOS**: Background transfer service (continues when app closed)
- **Android**: Uses persistent storage (`/files/` not `/cache/`)

**Important**: Requires rebuild after configuration changes:

```bash
pnpm android  # or pnpm ios
```

### Android Storage Notes

⚠️ **Critical**: Models MUST be saved to persistent storage, not cache directory.

**Troubleshooting "disappearing models"**:

1. Rebuild app after updating (`app.json` permissions changed)
2. Check console logs - should see "persistent storage" message
3. Disable battery optimization: Settings → Apps → Jot → Battery → Don't optimize
4. Ensure 2-3 GB free space on device

Models are stored in: `/data/user/0/<package>/files/models/` (persistent) ✅
NOT in: `/data/user/0/<package>/cache/` (can be cleared) 🚨

## Usage

### Basic Usage with useAIChat

```typescript
import { useAIChat } from "./lib/ai/useAIChat";

function MyComponent() {
  const {
    isReady,
    isGenerating,
    response,
    sendMessage,
    stop,
  } = useAIChat({
    entryId: 123,
    currentBlocks: blocks,
    onResponseComplete: (response) => {
      console.log("Generation complete:", response);
    },
    onError: (error) => {
      console.error("Generation error:", error);
    },
  });

  const handleSend = async () => {
    await sendMessage("Hello, how are you?");
  };

  return (
    <View>
      <Text>{response}</Text>
      {isGenerating && <Button onPress={stop} title="Stop" />}
    </View>
  );
}
```

### Direct LLM Access

```typescript
import { useLLMContext } from "./lib/ai/UnifiedModelProvider";

function MyComponent() {
  const llm = useLLMContext();

  const handleGenerate = async () => {
    const messages = [{ role: "user", content: "Hello!" }];

    const response = await llm.sendMessage(messages);
    console.log("Full response:", response);
  };
}
```

## Benefits

1. **Singleton LLM**: Single instance prevents OOM crashes
2. **Auto-save**: Responses saved even if component unmounts during generation
3. **Background support**: Generation continues when app is backgrounded (within OS limits)
4. **Simple API**: Just call `sendMessage()` and get a response
5. **Streaming**: Access `response` for real-time streaming display
