import React, { useState, useEffect } from "react";
import { PostHogProvider as PostHogProviderBase } from "posthog-react-native";
import { useDatabase } from "../db/DatabaseProvider";
import { TelemetrySettingsRepository } from "../db/telemetrySettings";

interface ConditionalPostHogProviderProps {
  children: React.ReactNode;
}

/**
 * PostHog provider that only initializes when telemetry is enabled.
 * 
 * PRIVACY NOTICE:
 * - We NEVER collect journal entries, personal content, or AI conversations
 * - Only anonymous usage data (button clicks, screen views, performance metrics)
 * - Users can disable this at any time in Settings > Privacy
 */
export function ConditionalPostHogProvider({
  children,
}: ConditionalPostHogProviderProps) {
  const db = useDatabase();
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkTelemetry = async () => {
      try {
        const repo = new TelemetrySettingsRepository(db);
        const enabled = await repo.isTelemetryEnabled();
        setTelemetryEnabled(enabled);
      } catch (error) {
        console.error("Error checking telemetry settings:", error);
        setTelemetryEnabled(false); // Default to disabled on error
      } finally {
        setIsLoading(false);
      }
    };

    checkTelemetry();
  }, [db]);

  // Wait until we know the telemetry preference
  if (isLoading) {
    return <>{children}</>;
  }

  // If telemetry is disabled, just render children without PostHog
  if (!telemetryEnabled) {
    return <>{children}</>;
  }

  // Telemetry is enabled - wrap with PostHog
  return (
    <PostHogProviderBase
      apiKey="phc_oiMeOmCKrWa06lKUwyYwTzFrIbkvbpEAzu6333vusTo"
      options={{
        host: "https://us.i.posthog.com",
      }}
    >
      {children}
    </PostHogProviderBase>
  );
}

