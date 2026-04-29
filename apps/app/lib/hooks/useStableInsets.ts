import { useRef } from "react";
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from "react-native-safe-area-context";

/**
 * Threshold in pixels — inset changes smaller than this are ignored
 * to prevent layout shift from measurement jitter.
 */
const JITTER_THRESHOLD = 2;

/**
 * Returns safe area insets that are stable across re-renders.
 *
 * `useSafeAreaInsets()` can update after the initial render when the native
 * measurement completes, even when `initialWindowMetrics` is provided. The
 * difference is usually 0–2 px but still causes a visible layout shift.
 *
 * This hook captures the insets on first render and only updates when a value
 * changes by more than `JITTER_THRESHOLD` pixels (e.g. device rotation).
 */
export function useStableInsets(): EdgeInsets {
  const measured = useSafeAreaInsets();
  const stableRef = useRef<EdgeInsets>({ ...measured });

  const maxDiff = Math.max(
    Math.abs(measured.top - stableRef.current.top),
    Math.abs(measured.bottom - stableRef.current.bottom),
    Math.abs(measured.left - stableRef.current.left),
    Math.abs(measured.right - stableRef.current.right),
  );

  if (maxDiff > JITTER_THRESHOLD) {
    stableRef.current = { ...measured };
  }

  return stableRef.current;
}
