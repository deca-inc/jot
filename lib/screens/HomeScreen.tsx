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
  Dimensions,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Text,
  EntryListItem,
  BottomComposer,
  Button,
  AnimatedBlob,
  type ComposerMode,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useEntryRepository, Entry, EntryType } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { getSeason, getTimeOfDay } from "../theme/seasonalTheme";
import { llmManager } from "../ai/ModelProvider";
import { Llama32_1B_Instruct } from "../ai/modelConfig";

type Filter = "all" | "journal" | "ai_chat" | "favorites";

export interface HomeScreenProps {
  refreshKey?: number;
  onOpenFullEditor?: (initialText?: string) => void;
  onOpenSettings?: () => void;
  onOpenEntryEditor?: (entryId: number) => void;
}

export function HomeScreen(props: HomeScreenProps = {}) {
  const { refreshKey, onOpenFullEditor, onOpenSettings, onOpenEntryEditor } =
    props;
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
          // Refresh entries
          loadEntries();
        } else {
          // Create AI chat entry and navigate to it
          const entry = await entryRepository.create({
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

          // Kick off background generation immediately
          // Use llmManager directly - don't block UI, generation happens in background
          const convoId = `entry-${entry.id}`;

          // Create listeners for DB writes (hook will add its own listeners when chat screen opens)
          let lastFullResponse = "";
          const listeners = {
            onToken: async (token: string) => {
              // Accumulate tokens for debounced DB write
              lastFullResponse += token;

              // Debounce: write every 100 chars to avoid too many DB writes
              if (lastFullResponse.length % 100 === 0) {
                try {
                  const updatedBlocks = [
                    ...entry.blocks,
                    {
                      type: "markdown" as const,
                      content: lastFullResponse,
                      role: "assistant" as const,
                    },
                  ];
                  await entryRepository.update(entry.id, {
                    blocks: updatedBlocks,
                  });
                } catch (e) {
                  console.warn("[HomeScreen] Failed to stream update:", e);
                }
              }
            },
            onMessageHistoryUpdate: async (messages: any[]) => {
              // Final write when generation completes
              try {
                const updatedBlocks = messages
                  .filter((m) => m.role !== "system")
                  .map((m) => ({
                    type: "markdown" as const,
                    content: m.content,
                    role: m.role as "user" | "assistant",
                  }));
                await entryRepository.update(entry.id, {
                  blocks: updatedBlocks,
                });
                // Refresh entries list to show updated content
                loadEntries();
              } catch (e) {
                console.warn(
                  "[HomeScreen] Failed to write message history:",
                  e
                );
              }
            },
          };

          // Don't pass initialBlocks - we'll use generate() with full context
          // This avoids duplication since generate() is stateless
          llmManager
            .getOrCreate(
              convoId,
              Llama32_1B_Instruct,
              listeners, // Register listeners for DB writes
              undefined // Don't configure with blocks - we'll use generate() instead
            )
            .then((llmForConvo) => {
              // Convert blocks to LLM messages for generate()
              // This includes the user message we just created
              const { blocksToLlmMessages } = require("../ai/ModelProvider");
              const messages = blocksToLlmMessages(
                entry.blocks,
                "You are a helpful AI assistant."
              );

              // Use generate() instead of sendMessage() since we already have the full history
              // This avoids duplication and properly handles the initial message
              llmForConvo.generate(messages).catch((e: any) => {
                console.error("[HomeScreen] Background generation failed:", e);
              });
            })
            .catch((e) => {
              console.error("[HomeScreen] Failed to initialize LLM:", e);
            });
          // Navigate to the newly created AI chat entry
          if (onOpenEntryEditor) {
            onOpenEntryEditor(entry.id);
          }
          // Refresh entries
          loadEntries();
        }
      } catch (error) {
        console.error("Error creating entry:", error);
      }
    },
    [composerMode, entryRepository, loadEntries, onOpenEntryEditor]
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

  const groupedEntries = groupEntriesByDay(entries);

  if (isLoading) {
    return <LoadingState seasonalTheme={seasonalTheme} />;
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
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: seasonalTheme.cardBg,
                  borderColor: seasonalTheme.textSecondary + "20",
                },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={20}
                color={seasonalTheme.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={[
                  styles.searchInput,
                  {
                    color: seasonalTheme.textPrimary,
                  },
                ]}
                placeholder=""
                placeholderTextColor={seasonalTheme.textSecondary}
              />
            </View>
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

function LoadingState({
  seasonalTheme,
}: {
  seasonalTheme: ReturnType<typeof useSeasonalTheme>;
}) {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get("window");
    return { width, height };
  });
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions({ width: window.width, height: window.height });
    });

    // Fade in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 20,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      subscription?.remove();
    };
  }, [fadeAnim, scaleAnim]);

  // Get a subtle color from the theme for the blob
  const blobColor =
    seasonalTheme.subtleGlow.shadowColor || seasonalTheme.chipText;

  return (
    <View
      style={[
        styles.gradient,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <AnimatedBlob
        width={dimensions.width}
        height={dimensions.height}
        color={blobColor}
        opacity={0.15}
      />
      <View style={styles.loadingContainer}>
        <Animated.View
          style={[
            styles.loadingContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.loadingIndicatorWrapper}>
            <ActivityIndicator
              size="large"
              color={seasonalTheme.textSecondary}
              style={styles.activityIndicator}
            />
          </View>
          <Text
            variant="body"
            style={[styles.loadingText, { color: seasonalTheme.textSecondary }]}
          >
            Loading entries...
          </Text>
        </Animated.View>
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingIndicatorWrapper: {
    marginBottom: spacingPatterns.md,
  },
  activityIndicator: {
    opacity: 0.8,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
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
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacingPatterns.md,
  },
  searchIcon: {
    marginRight: spacingPatterns.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
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
