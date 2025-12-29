import { useState, useEffect, useRef } from "react";

// Generic function type for debounce/throttle
type AnyFunction = (...args: never[]) => unknown;

interface DebouncedFunction<T extends AnyFunction> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: (...args: Parameters<T>) => void;
}

interface ThrottledFunction<T extends AnyFunction> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * Create a debounced function that delays execution until after
 * a specified wait time has elapsed since the last invocation.
 *
 * Unlike useEffect-based debouncing, this is event-driven.
 */
export function debounce<T extends AnyFunction>(
  func: T,
  wait: number,
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...(args as Parameters<T>));
      timeout = null;
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  debounced.flush = (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    func(...(args as Parameters<T>));
  };

  return debounced as DebouncedFunction<T>;
}

/**
 * Create a throttled function that only executes at most once
 * per specified time period.
 */
export function throttle<T extends AnyFunction>(
  func: T,
  wait: number,
): ThrottledFunction<T> {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;

    if (!timeout) {
      func(...(args as Parameters<T>));
      timeout = setTimeout(() => {
        timeout = null;
        if (lastArgs) {
          func(...(lastArgs as Parameters<T>));
          lastArgs = null;
        }
      }, wait);
    }
  };

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
      lastArgs = null;
    }
  };

  return throttled as ThrottledFunction<T>;
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
