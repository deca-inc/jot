import { useLocalSearchParams, router } from "expo-router";
import { useCallback } from "react";
import { CountdownComposer } from "../../../lib/screens/CountdownComposer";

export default function ComposeCountdownRoute() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const handleSave = useCallback((entryId: number) => {
    router.replace(`/(main)/entry/${entryId}`);
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <CountdownComposer
      entryId={editId ? Number(editId) : undefined}
      onSave={handleSave}
      onCancel={handleCancel}
      compact
    />
  );
}
