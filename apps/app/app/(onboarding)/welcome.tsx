import { router } from "expo-router";
import { WelcomeScreen } from "../../lib/screens";

export default function WelcomeRoute() {
  return (
    <WelcomeScreen onContinue={() => router.push("/(onboarding)/telemetry")} />
  );
}
