import { useLocalSearchParams, router } from "expo-router";
import { useCallback } from "react";
import { ComposerScreen } from "../../../lib/screens";

export default function ComposeJournalRoute() {
  const { parentId } = useLocalSearchParams<{ parentId?: string }>();

  const handleSave = useCallback((entryId: number) => {
    router.replace(`/(main)/entry/${entryId}`);
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <ComposerScreen
      initialType="journal"
      parentId={parentId ? Number(parentId) : undefined}
      onSave={handleSave}
      onCancel={handleCancel}
      hideBackButton
    />
  );
}
