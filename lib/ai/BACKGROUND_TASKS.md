# Background Task Support for AI Generation

## Overview

This implementation adds background task support for AI generation, allowing model generation to continue (within OS-imposed limits) when the app is backgrounded.

## Important Limitations

### iOS
- **Background tasks are time-limited**: iOS typically allows background tasks to run for 30 seconds to a few minutes maximum
- **CPU-intensive tasks may be suspended**: ML inference is CPU/GPU intensive and iOS may suspend the app process regardless of background mode
- **Background modes required**: The app must declare background modes in `Info.plist` (already configured in `app.json`)

### Android
- **Battery optimization**: Android's battery optimization features may kill background tasks
- **Foreground service required for long tasks**: For truly continuous background execution, a foreground service with a notification is required
- **More flexible than iOS**: Android generally allows longer background execution, but still has restrictions

### General Considerations
- **No guarantee of completion**: Even with background tasks registered, the OS may suspend or kill the app process
- **User experience**: Background execution can impact battery life and device performance
- **Testing**: Background behavior must be tested on real devices, not simulators

## Implementation Details

### Files

1. **`lib/ai/backgroundTasks.ts`**: Background task registration and management
   - Registers background fetch tasks using `expo-task-manager` and `expo-background-fetch`
   - Provides utilities to check if background tasks are available

2. **`lib/ai/LLMProvider.tsx`**: Singleton LLM with background support
   - Registers background tasks on mount
   - Keeps LLM instance alive at app level
   - Provides pending save mechanism for when component unmounts during generation

3. **`app.json`**: Updated with background permissions
   - iOS: Added `UIBackgroundModes` for `background-fetch` and `background-processing`
   - Android: Added permissions for `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`

### How It Works

1. **On App Start**: `LLMProvider` registers background tasks when it mounts
2. **Single LLM Instance**: The LLM stays mounted at app level, preventing OOM and allowing background generation
3. **Pending Save**: If component unmounts during generation, `LLMProvider` saves the response when complete

### Usage

Background task support is automatic when using `useAIChat` or `useLLMContext`. The `LLMProvider` handles:

- Background task registration
- Keeping LLM alive
- Saving responses even if chat component unmounts

### Testing Background Tasks

To test background execution:

1. **iOS**:
   - Start a generation
   - Press home button or switch apps
   - Check logs to see if generation continues
   - Note: iOS may suspend after ~30 seconds

2. **Android**:
   - Start a generation
   - Press home button or switch apps
   - Check logs to see if generation continues
   - May need to disable battery optimization for the app in system settings

### Future Improvements

If you need more reliable background execution:

1. **Android Foreground Service**: Implement a foreground service with a persistent notification (requires more native code)
2. **Task Persistence**: Save generation state and resume when app returns to foreground
3. **Push Notifications**: Notify user when generation completes if app was backgrounded

## References

- [Expo Task Manager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Expo Background Fetch](https://docs.expo.dev/versions/latest/sdk/background-fetch/)
- [React Native AppState](https://reactnative.dev/docs/appstate)
