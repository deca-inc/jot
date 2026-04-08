import { router } from "expo-router";
import { TelemetryConsentScreen } from "../../lib/screens";

export default function TelemetryRoute() {
  return (
    <TelemetryConsentScreen
      onContinue={() => router.push("/(onboarding)/model-selection")}
    />
  );
}
