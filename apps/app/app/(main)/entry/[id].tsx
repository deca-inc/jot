import { useLocalSearchParams, router } from "expo-router";
import { useCallback } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useEntry } from "../../../lib/db/useEntries";
import { useModelInfo } from "../../../lib/navigation/ModelInfoContext";
import { ComposerScreen } from "../../../lib/screens";
import { CountdownViewer } from "../../../lib/screens/CountdownViewer";
import { useSeasonalTheme } from "../../../lib/theme/SeasonalThemeProvider";

export default function EntryRoute() {
  const { id, checkinPrompt, parentId } = useLocalSearchParams<{
    id: string;
    checkinPrompt?: string;
    parentId?: string;
  }>();
  const entryId = Number(id);

  // Clean up redundant ?id= query param that Expo Router adds on web
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (url.pathname.match(/\/entry\/\d+/) && url.searchParams.has("id")) {
      url.searchParams.delete("id");
      window.history.replaceState(null, "", url.pathname + (url.search || ""));
    }
  }

  const seasonalTheme = useSeasonalTheme();
  const entryQuery = useEntry(entryId);
  const { setModelInfo } = useModelInfo();

  const handleSave = useCallback(
    (savedId: number) => {
      // Update URL to reflect the saved entry ID if it was a new entry
      if (savedId !== entryId) {
        router.replace(`/(main)/entry/${savedId}`);
      }
    },
    [entryId],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  const handleCountdownEdit = useCallback((editId: number) => {
    router.push(`/(main)/compose/countdown?editId=${editId}`);
  }, []);

  const handleAddCheckin = useCallback((countdownParentId: number) => {
    router.push(`/(main)/compose/journal?parentId=${countdownParentId}`);
  }, []);

  const handleOpenCheckin = useCallback((checkinId: number) => {
    router.push(`/(main)/entry/${checkinId}`);
  }, []);

  const handleCountdownClose = useCallback(() => {
    router.back();
  }, []);

  // Show loading while entry data loads, or render nothing if entry was deleted
  if (!entryQuery.data) {
    if (entryQuery.isLoading) {
      return (
        <View
          style={[
            styles.loading,
            { backgroundColor: seasonalTheme.gradient.middle },
          ]}
        >
          <ActivityIndicator color={seasonalTheme.textSecondary} />
        </View>
      );
    }
    // Entry was deleted — render empty so the cache update doesn't cascade
    return (
      <View
        style={{ flex: 1, backgroundColor: seasonalTheme.gradient.middle }}
      />
    );
  }

  // Countdown entries get the CountdownViewer
  if (entryQuery.data?.type === "countdown") {
    return (
      <CountdownViewer
        entryId={entryId}
        onClose={handleCountdownClose}
        onEdit={handleCountdownEdit}
        onAddCheckin={handleAddCheckin}
        onOpenCheckin={handleOpenCheckin}
        showCheckinPrompt={checkinPrompt === "true"}
        compact
      />
    );
  }

  // Journal and AI chat entries get the ComposerScreen
  return (
    <ComposerScreen
      entryId={entryId}
      initialType={entryQuery.data?.type as "journal" | "ai_chat" | undefined}
      parentId={parentId ? Number(parentId) : undefined}
      onSave={handleSave}
      onCancel={handleCancel}
      onModelInfo={setModelInfo}
      hideBackButton
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
