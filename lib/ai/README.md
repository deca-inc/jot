# AI Model Service

This module provides a simplified, callback-based API for AI model generation.

## Architecture

The implementation is split into two layers:

1. **`ModelService` class** (`modelService.ts`) - Pure service class with no React dependencies
   - Handles model loading, generation, and token streaming
   - Provides simple callback-based API: `onToken`, `onStart`, `onComplete`, `onError`
   - Can be used from React or anywhere else in the app

2. **`ModelProvider` component** (`ModelProvider.tsx`) - React wrapper
   - Thin React wrapper around the service class
   - Provides React context for components
   - Manages background tasks and app state monitoring

## Usage

### Basic Usage

```typescript
import { useModelService } from "./lib/ai/ModelProvider";

function MyComponent() {
  const modelService = useModelService();

  const handleGenerate = async () => {
    try {
      const response = await modelService.generate(messages, {
        onToken: (token, fullText) => {
          // Called for each new token as it's generated
          console.log("New token:", token);
          console.log("Full text so far:", fullText);
          // Update your UI here
        },
        onStart: () => {
          console.log("Generation started");
        },
        onComplete: (fullText) => {
          console.log("Generation complete:", fullText);
        },
        onError: (error) => {
          console.error("Generation error:", error);
        },
      });
    } catch (error) {
      console.error("Failed to generate:", error);
    }
  };
}
```

### Token Streaming Example

The `onToken` callback is called with each new token as it's generated:

```typescript
const [response, setResponse] = useState("");

await modelService.generate(messages, {
  onToken: (token, fullText) => {
    // Update UI with each new token
    setResponse(fullText);
  },
});
```

### Without Callbacks (Simple)

You can also use it without callbacks - it returns the full response when complete:

```typescript
const response = await modelService.generate(messages);
console.log("Full response:", response);
```

## Benefits

1. **Simpler API**: No need to poll for updates - just pass callbacks
2. **Better Performance**: Callbacks are called directly when tokens are available
3. **Separation of Concerns**: Model logic is separate from React
4. **Testable**: The service class can be tested independently
5. **Reusable**: Can be used outside React components if needed

## Migration from useModelStreaming

Replace any usage of `useModelStreaming(modelService, onUpdate)` with the callback-based API on `generate`:

```typescript
await modelService.generate(messages, {
  onToken: (token, fullText) => {
    setResponse(fullText);
  },
});
```

This approach is more efficient and provides access to individual tokens as they stream.

