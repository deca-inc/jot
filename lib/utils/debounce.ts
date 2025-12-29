import { useState, useEffect, useRef } from "react";

/**
 * Create a debounced function that delays execution until after
 * a specified wait time has elapsed since the last invocation.
 *
 * Unlike useEffect-based debouncing, this is event-driven.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
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
  wait: number,
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

/**
 * Hook to debounce a value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook to throttle a value - updates at most once per interval.
 * Uses a polling approach to avoid effect cleanup issues.
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const latestValueRef = useRef<T>(value);
  const lastEmittedRef = useRef<T>(value);
  const initializedRef = useRef(false);
  latestValueRef.current = value;

  // Use interval-based polling
  useEffect(() => {
    // Set initial value only once
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastEmittedRef.current = latestValueRef.current;
      setThrottledValue(latestValueRef.current);
    }

    const intervalId = setInterval(() => {
      // Only update state if value actually changed
      if (latestValueRef.current !== lastEmittedRef.current) {
        lastEmittedRef.current = latestValueRef.current;
        setThrottledValue(latestValueRef.current);
      }
    }, interval);

    return () => clearInterval(intervalId);
  }, [interval]); // Only re-create interval if interval changes

  return throttledValue;
}
