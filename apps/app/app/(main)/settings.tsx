import { router } from "expo-router";
import { useCallback } from "react";
import { SettingsScreen } from "../../lib/screens";

export default function SettingsRoute() {
  const handleNavigateToPlayground = useCallback(() => {
    router.push("/(main)/playground");
  }, []);

  const handleNavigateToQuillEditor = useCallback(() => {
    router.push("/(main)/quill-editor");
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return (
    <SettingsScreen
      onNavigateToPlayground={handleNavigateToPlayground}
      onNavigateToQuillEditor={handleNavigateToQuillEditor}
      onBack={handleBack}
      compact
    />
  );
}
