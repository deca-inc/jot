import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Text,
  EntryListItem,
  BottomComposer,
  Button,
  type ComposerMode,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useEntryRepository, Entry, EntryType } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { getSeason, getTimeOfDay } from "../theme/seasonalTheme";

type Filter = "all" | "journal" | "ai_chat" | "favorites";

export interface HomeScreenProps {
  onNewEntry?: (type?: "journal" | "ai_chat") => void;
  refreshKey?: number;
  onOpenFullEditor?: (initialText?: string) => void;
  onOpenSettings?: () => void;
  onOpenEntryEditor?: (entryId: number) => void;
}

export function HomeScreen(props: HomeScreenProps = {}) {
  const {
    onNewEntry,
    refreshKey,
    onOpenFullEditor,
    onOpenSettings,
    onOpenEntryEditor,
  } = props;
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const entryRepository = useEntryRepository();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [composerMode, setComposerMode] = useState<ComposerMode>("journal");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [composerHeight, setComposerHeight] = useState(120); // Default height
  const composerRef = useRef<View>(null);

  const loadEntries = useCallback(async () => {
    try {
      const options: {
        type?: EntryType;
        isFavorite?: boolean;
        orderBy?: "createdAt" | "updatedAt";
        order?: "ASC" | "DESC";
      } = {
        orderBy: "updatedAt",
        order: "DESC",
      };

      if (filter === "journal") {
        options.type = "journal";
      } else if (filter === "ai_chat") {
        options.type = "ai_chat";
      } else if (filter === "favorites") {
        options.isFavorite = true;
      }

      const loadedEntries = await entryRepository.getAll(options);
      setEntries(loadedEntries);
    } catch (error) {
      console.error("Error loading entries:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [entryRepository, filter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshKey]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadEntries();
  }, [loadEntries]);

  const handleToggleFavorite = useCallback(
    async (entry: Entry) => {
      try {
        const updated = await entryRepository.toggleFavorite(entry.id);
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? updated : e))
        );
      } catch (error) {
        console.error("Error toggling favorite:", error);
      }
    },
    [entryRepository]
  );

  const handleEntryPress = useCallback(
    (entry: Entry) => {
      if (onOpenEntryEditor) {
        onOpenEntryEditor(entry.id);
      }
    },
    [onOpenEntryEditor]
  );

  const handleStartTyping = useCallback(
    (text: string) => {
      // Journal mode: open full-screen editor with the text
      if (composerMode === "journal" && onOpenFullEditor) {
        onOpenFullEditor(text);
      }
    },
    [composerMode, onOpenFullEditor]
  );

  const handleComposerSubmit = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      try {
        if (composerMode === "journal") {
          // Create journal entry
          await entryRepository.create({
            type: "journal",
            title: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
            blocks: text
              .split("\n\n")
              .filter((p) => p.trim())
              .map((p) => ({
                type: "paragraph" as const,
                content: p.trim(),
              })),
            tags: [],
            attachments: [],
            isFavorite: false,
          });
        } else {
          // Create AI chat entry
          await entryRepository.create({
            type: "ai_chat",
            title: "AI Conversation",
            blocks: [
              {
                type: "markdown" as const,
                content: text.trim(),
                role: "user" as const,
              },
            ],
            tags: [],
            attachments: [],
            isFavorite: false,
          });
        }

        // Refresh entries
        loadEntries();
      } catch (error) {
        console.error("Error creating entry:", error);
      }
    },
    [composerMode, entryRepository, loadEntries]
  );

  const groupEntriesByDay = (entries: Entry[]): Map<string, Entry[]> => {
    const grouped = new Map<string, Entry[]>();

    entries.forEach((entry) => {
      const date = new Date(entry.updatedAt);
      const dateKey = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      ).toISOString();

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(entry);
    });

    return grouped;
  };

  const formatDateHeader = (dateKey: string): string => {
    const date = new Date(dateKey);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const entryDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    if (entryDate.getTime() === today.getTime()) {
      return "Today";
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (entryDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    }

    const daysDiff = Math.floor(
      (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: "long" });
    }

    return date.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const now = new Date();
  const dayLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const season = getSeason(now);
  const timeOfDay = getTimeOfDay(now);
  const seasonName = season.charAt(0).toUpperCase() + season.slice(1);
  const isNight = timeOfDay === "night";

  const groupedEntries = groupEntriesByDay(entries);

  if (isLoading) {
    return (
      <View
        style={[
          styles.gradient,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
      >
        <View style={styles.container}>
          <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
            Loading entries...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.gradient,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: seasonalTheme.cardBg,
                  color: seasonalTheme.textPrimary,
                  borderColor: seasonalTheme.textSecondary + "20",
                },
              ]}
              placeholder="Search your memories or ask privately…"
              placeholderTextColor={seasonalTheme.textSecondary}
            />
            {onOpenSettings && (
              <TouchableOpacity
                onPress={onOpenSettings}
                style={styles.settingsButton}
              >
                <Ionicons
                  name="settings-outline"
                  size={24}
                  color={seasonalTheme.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content area */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: composerHeight },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
                No entries yet
              </Text>
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textSecondary,
                  marginTop: spacingPatterns.sm,
                }}
              >
                {filter === "favorites"
                  ? "You haven't favorited any entries yet"
                  : "Create your first entry to get started"}
              </Text>
            </View>
          ) : (
            Array.from(groupedEntries.entries())
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([dateKey, dayEntries]) => (
                <View key={dateKey} style={styles.daySection}>
                  <Text
                    variant="h2"
                    style={{
                      color: seasonalTheme.textPrimary,
                      marginBottom: spacingPatterns.md,
                    }}
                  >
                    {formatDateHeader(dateKey)}
                  </Text>
                  {dayEntries.map((entry) => (
                    <EntryListItem
                      key={entry.id}
                      entry={entry}
                      onPress={handleEntryPress}
                      onToggleFavorite={handleToggleFavorite}
                      seasonalTheme={seasonalTheme}
                    />
                  ))}
                </View>
              ))
          )}
        </ScrollView>

        {/* Bottom Composer with Safe Area */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.bottomComposerContainer}
          keyboardVerticalOffset={0}
        >
          <View
            ref={composerRef}
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              setComposerHeight(height + insets.bottom);
            }}
          >
            <BottomComposer
              mode={composerMode}
              onModeChange={setComposerMode}
              onStartTyping={handleStartTyping}
              onSubmit={handleComposerSubmit}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    padding: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  searchInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 44,
  },
  settingsButton: {
    borderRadius: borderRadius.full,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  daySection: {
    marginBottom: spacingPatterns.xl,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.xl * 2,
  },
  bottomComposerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
