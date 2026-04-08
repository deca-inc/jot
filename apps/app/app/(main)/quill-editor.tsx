import { router } from "expo-router";
import { useCallback } from "react";
import { QuillEditorScreen } from "../../lib/screens";

export default function QuillEditorRoute() {
  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return <QuillEditorScreen onBack={handleBack} />;
}
