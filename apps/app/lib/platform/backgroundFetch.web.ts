/**
 * Web shim for expo-background-fetch
 *
 * No-op - background fetch is not applicable on web.
 */

export const BackgroundFetchStatus = {
  Denied: 1,
  Restricted: 2,
  Available: 3,
} as const;

export const BackgroundFetchResult = {
  NoData: 1,
  NewData: 2,
  Failed: 3,
} as const;

export async function getStatusAsync(): Promise<number> {
  return BackgroundFetchStatus.Denied;
}

export async function registerTaskAsync(
  _taskName: string,
  _options?: Record<string, unknown>,
): Promise<void> {}

export async function unregisterTaskAsync(_taskName: string): Promise<void> {}
