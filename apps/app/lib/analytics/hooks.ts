import { usePostHog as usePostHogBase } from "posthog-react-native";
import { useEffect, useCallback } from "react";

/**
 * Safe wrapper around PostHog hook that handles cases when PostHog is disabled.
 * Returns null for all methods when telemetry is disabled.
 */
export function usePostHog() {
  try {
    const posthog = usePostHogBase();
    return posthog;
  } catch (_error) {
    // PostHog provider not available (telemetry disabled)
    return null;
  }
}

/**
 * Hook to automatically track screen views.
 * Call this at the top of each screen component.
 *
 * @param screenName - Name of the screen (e.g., "Home", "Settings", "Composer")
 * @param properties - Optional additional properties (e.g., { entryType: "journal" })
 *
 * @example
 * function HomeScreen() {
 *   useTrackScreenView("Home");
 *   // ... rest of component
 * }
 */
// Type alias for properties that can be sent to PostHog
// Must not include undefined as PostHog's JsonType doesn't support it
type AnalyticsProperties = Record<string, string | number | boolean | null>;

export function useTrackScreenView(
  screenName: string,
  properties?: AnalyticsProperties,
) {
  const posthog = usePostHog();

  useEffect(() => {
    if (posthog) {
      posthog.screen(screenName, properties);
    }
  }, [posthog, screenName, properties]);
}

/**
 * Hook to track events with automatic null-safety.
 *
 * @example
 * const trackEvent = useTrackEvent();
 * trackEvent("button_clicked", { buttonName: "Save Entry" });
 */
export function useTrackEvent() {
  const posthog = usePostHog();

  return useCallback(
    (eventName: string, properties?: AnalyticsProperties) => {
      if (posthog) {
        posthog.capture(eventName, properties);
      }
    },
    [posthog],
  );
}

/**
 * Sanitize properties to ensure no personal content is sent.
 * Removes any fields that might contain user content.
 */
export function sanitizeProperties(
  properties: AnalyticsProperties,
): AnalyticsProperties {
  const sanitized = { ...properties };

  // List of fields that should never be sent to analytics
  const forbiddenFields = [
    "content",
    "text",
    "title",
    "body",
    "message",
    "prompt",
    "response",
    "entry",
    "journal",
    "blocks",
    "markdown",
    "html",
  ];

  forbiddenFields.forEach((field) => {
    delete sanitized[field];
  });

  return sanitized;
}
