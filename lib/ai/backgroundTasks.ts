/**
 * Background task handlers for AI model generation
 *
 * IMPORTANT LIMITATIONS:
 * - iOS: Background tasks are time-limited (typically 30 seconds to a few minutes)
 * - Android: More flexible but still has battery optimization restrictions
 * - CPU-intensive ML inference may be suspended by the OS regardless of background mode
 *
 * This module provides background task registration for model operations,
 * but generation may still be interrupted when the app is backgrounded.
 */

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

export const BACKGROUND_GENERATION_TASK = "background-generation";

/**
 * Register background task for model generation
 * This allows the model to continue running when app is backgrounded
 * (within OS-imposed time limits)
 */
export function registerBackgroundTasks() {
  // Register the background task
  TaskManager.defineTask(BACKGROUND_GENERATION_TASK, async () => {
    try {
      // The actual generation logic is handled by ModelProvider
      // This task mainly serves to keep the app process alive
      console.log("[BackgroundTask] Background task running");
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (err) {
      console.error("[BackgroundTask] Task failed:", err);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  // Register background task (new API)
  // Note: This will fail until Info.plist has UIBackgroundModes with 'processing' and the app is rebuilt
  BackgroundTask.registerTaskAsync(BACKGROUND_GENERATION_TASK).catch(
    (err: any) => {
      const code = err?.code || err?.message || String(err);
      console.warn("[BackgroundTask] Failed to register:", code);
    },
  );
}

/**
 * Unregister background tasks
 */
export async function unregisterBackgroundTasks() {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_GENERATION_TASK);
  } catch (err) {
    console.error("[BackgroundTask] Failed to unregister:", err);
  }
}

/**
 * Check if background tasks are available
 */
export async function isBackgroundTaskAvailable(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    return status === BackgroundTask.BackgroundTaskStatus.Available;
  } catch (_err) {
    // If background tasks are disabled or not configured, return false gracefully
    return false;
  }
}
