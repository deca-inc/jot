import { router } from "expo-router";
import { useCallback } from "react";
import { ComponentPlaygroundScreen } from "../../lib/screens";

export default function PlaygroundRoute() {
  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return <ComponentPlaygroundScreen onBack={handleBack} />;
}
