import { router } from "expo-router";
import { useCallback } from "react";
import { useModelInfo } from "../../../lib/navigation/ModelInfoContext";
import { ComposerScreen } from "../../../lib/screens";

export default function ComposeChatRoute() {
  const { setModelInfo, setComposerEntryId } = useModelInfo();

  const handleSave = useCallback((entryId: number) => {
    router.replace(`/(main)/entry/${entryId}`);
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <ComposerScreen
      initialType="ai_chat"
      onSave={handleSave}
      onCancel={handleCancel}
      onModelInfo={setModelInfo}
      onComposerEntryId={setComposerEntryId}
      hideBackButton
    />
  );
}
