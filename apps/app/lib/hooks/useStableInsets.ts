import { useRef } from "react";
import { Platform } from "react-native";
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from "react-native-safe-area-context";

/**
 * Threshold in pixels — inset changes smaller than this are ignored
 * to prevent layout shift from measurement jitter.
 */
const JITTER_THRESHOLD = 2;

const CACHE_KEY = "jot-safe-area-insets";

/**
 * Read cached safe-area insets synchronously from localStorage (web).
 * Returns null on native platforms or when no cached value exists.
 */
export function getCachedSafeAreaInsets(): EdgeInsets | null {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.top === "number" &&
      typeof parsed.bottom === "number" &&
      typeof parsed.left === "number" &&
      typeof parsed.right === "number"
    ) {
      return parsed as EdgeInsets;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/** Persist insets to localStorage for next boot (fire-and-forget). */
function writeCachedInsets(insets: EdgeInsets): void {
  if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
      }),
    );
  } catch {
    // Ignore write errors
  }
}

/** Cached insets read once at module load time (synchronous on web). */
const _cachedInsets = getCachedSafeAreaInsets();

/**
 * Returns safe area insets that are stable across re-renders.
 *
 * On first render, if the native measurement reports all zeros (not yet ready),
 * returns previously cached values from a prior app session — preventing visible
 * layout shift on boot. Once the real measurement arrives, it's adopted (if
 * meaningfully different) and cached for next boot.
 *
 * Small jitter (< JITTER_THRESHOLD px) between re-measurements is ignored.
 */
export function useStableInsets(): EdgeInsets {
  const measured = useSafeAreaInsets();
  const stableRef = useRef<EdgeInsets | null>(null);

  if (stableRef.current === null) {
    const allZero =
      measured.top === 0 &&
      measured.bottom === 0 &&
      measured.left === 0 &&
      measured.right === 0;

    if (allZero && _cachedInsets) {
      // Measurement not ready yet — use values cached from a previous boot
      stableRef.current = { ..._cachedInsets };
    } else {
      stableRef.current = { ...measured };
      if (!allZero) {
        writeCachedInsets(measured);
      }
    }
  } else {
    const maxDiff = Math.max(
      Math.abs(measured.top - stableRef.current.top),
      Math.abs(measured.bottom - stableRef.current.bottom),
      Math.abs(measured.left - stableRef.current.left),
      Math.abs(measured.right - stableRef.current.right),
    );

    if (maxDiff > JITTER_THRESHOLD) {
      stableRef.current = { ...measured };
      writeCachedInsets(measured);
    }
  }

  return stableRef.current;
}
