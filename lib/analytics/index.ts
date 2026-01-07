/**
 * Analytics module for the Journal app.
 *
 * Privacy-first telemetry:
 * - Only enabled when user opts in
 * - Never collects journal entries, AI conversations, or personal content
 * - Collects anonymous usage data to improve the app
 */

export { ConditionalPostHogProvider } from "./PostHogProvider";
export {
  usePostHog,
  useTrackScreenView,
  useTrackEvent,
  sanitizeProperties,
} from "./hooks";
