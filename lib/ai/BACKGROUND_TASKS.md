# Background Task Support for Model Provider

## Overview

This implementation adds background task support for the AI model provider, allowing model generation to continue (within OS-imposed limits) when the app is backgrounded.

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

### Files Added/Modified

1. **`lib/ai/backgroundTasks.ts`**: Background task registration and management
   - Registers background fetch tasks using `expo-task-manager` and `expo-background-fetch`
   - Provides utilities to check if background tasks are available

2. **`lib/ai/ModelProvider.tsx`**: Enhanced with app state monitoring
   - Monitors app state changes (foreground/background)
   - Registers background tasks on mount
   - Provides warnings when generation occurs while backgrounded
   - Checks background task availability

3. **`app.json`**: Updated with background permissions
   - iOS: Added `UIBackgroundModes` for `background-fetch` and `background-processing`
   - Android: Added permissions for `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`

### How It Works

1. **On App Start**: `ModelProvider` registers background tasks when it mounts
2. **App State Monitoring**: The provider listens for foreground/background transitions
3. **During Generation**: The provider checks if the app is backgrounded and logs warnings
4. **Background Execution**: The OS may allow the task to continue for a limited time

### Usage

The background task support is automatic - no code changes needed in components using `useModelService()`. The ModelProvider handles:

- Background task registration/unregistration
- App state monitoring
- Warnings when generation might be interrupted

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
3. **Queue System**: Queue generation requests and process them when app is active
4. **Push Notifications**: Notify user when generation completes if app was backgrounded

## References

- [Expo Task Manager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Expo Background Fetch](https://docs.expo.dev/versions/latest/sdk/background-fetch/)
- [React Native AppState](https://reactnative.dev/docs/appstate)

