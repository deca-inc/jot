/**
 * Create a debounced function that delays execution until after
 * a specified wait time has elapsed since the last invocation.
 *
 * Unlike useEffect-based debouncing, this is event-driven.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };

  // Add cancel method to clear pending execution
  (debounced as any).cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  // Add flush method to execute immediately
  (debounced as any).flush = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    func(...args);
  };

  return debounced;
}

/**
 * Create a throttled function that only executes at most once
 * per specified time period.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;

    if (!timeout) {
      func(...args);
      timeout = setTimeout(() => {
        timeout = null;
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, wait);
    }
  };

  // Add cancel method
  (throttled as any).cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      lastArgs = null;
    }
  };

  return throttled;
}
