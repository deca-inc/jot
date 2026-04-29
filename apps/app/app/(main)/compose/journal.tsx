import { useLocalSearchParams, router } from "expo-router";
import { useCallback } from "react";
import { useModelInfo } from "../../../lib/navigation/ModelInfoContext";
import { ComposerScreen } from "../../../lib/screens";

export default function ComposeJournalRoute() {
  const { parentId, initialText } = useLocalSearchParams<{
    parentId?: string;
    initialText?: string;
  }>();
  const { setComposerEntryId } = useModelInfo();

  const handleSave = useCallback((entryId: number) => {
    router.replace(`/(main)/entry/${entryId}`);
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <ComposerScreen
      initialType="journal"
      initialContent={initialText}
      parentId={parentId ? Number(parentId) : undefined}
      onSave={handleSave}
      onCancel={handleCancel}
      onComposerEntryId={setComposerEntryId}
      hideBackButton
    />
  );
}
