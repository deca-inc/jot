/**
 * Web shim for expo-task-manager
 *
 * No-op - task manager is not applicable on web.
 */

export function defineTask(_name: string, _callback: unknown): void {}

export async function isTaskRegisteredAsync(
  _taskName: string,
): Promise<boolean> {
  return false;
}

export async function getRegisteredTasksAsync(): Promise<
  Array<{ taskName: string; taskType: string }>
> {
  return [];
}

export async function unregisterAllTasksAsync(): Promise<void> {}

export async function unregisterTaskAsync(_taskName: string): Promise<void> {}

export function isTaskDefined(_taskName: string): boolean {
  return false;
}
