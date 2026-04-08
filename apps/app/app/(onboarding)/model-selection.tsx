import { router } from "expo-router";
import { useDatabase } from "../../lib/db/DatabaseProvider";
import { OnboardingSettingsRepository } from "../../lib/db/onboardingSettings";
import { OnboardingModelSelectionScreen } from "../../lib/screens";

export default function ModelSelectionRoute() {
  const db = useDatabase();

  const handleContinue = async () => {
    try {
      const repo = new OnboardingSettingsRepository(db);
      await repo.markOnboardingComplete();
    } catch (error) {
      console.error("Error marking onboarding complete:", error);
    }
    router.replace("/(main)");
  };

  return <OnboardingModelSelectionScreen onContinue={handleContinue} />;
}
