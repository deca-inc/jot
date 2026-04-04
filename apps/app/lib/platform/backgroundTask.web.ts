/**
 * Web shim for expo-background-task
 *
 * No-op - background tasks are not applicable on web.
 */

export const BackgroundTaskResult = {
  Success: 1,
  Failed: 2,
} as const;

export async function registerTaskAsync(
  _taskName: string,
  _options?: Record<string, unknown>,
): Promise<void> {}

export async function unregisterTaskAsync(_taskName: string): Promise<void> {}
