import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { useDebounce } from "../utils/debounce";
import {
  View,
  StyleSheet,
  FlatList,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  TouchableOpacity,
  ListRenderItem,
  Alert,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Text,
  EntryListItem,
  BottomComposer,
  Button,
  ModelDownloadIndicator,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { Entry } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { llmManager } from "../ai/ModelProvider";
import { Llama32_1B_Instruct } from "../ai/modelConfig";
import {
  useInfiniteEntries,
  useSearchEntries,
  useCreateEntry,
  useToggleFavorite,
  useUpdateEntry,
} from "../db/useEntries";
import { useModel } from "../ai/ModelProvider";
import { useComposerSettings, type ComposerMode } from "../db/composerSettings";
import { useTrackScreenView, useTrackEvent } from "../analytics";

type Filter = "all" | "journal" | "ai_chat" | "favorites";

export interface HomeScreenProps {
  refreshKey?: number;
  onOpenFullEditor?: (initialText?: string) => void;
  onOpenSettings?: () => void;
  onOpenEntryEditor?: (entryId: number) => void;
}

export function HomeScreen(props: HomeScreenProps = {}) {
  const { onOpenFullEditor, onOpenSettings, onOpenEntryEditor } = props;
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");

  // Track screen view
  useTrackScreenView("Home");
  const trackEvent = useTrackEvent();
  const [composerMode, setComposerMode] = useState<ComposerMode>("journal");
  const [composerHeight, setComposerHeight] = useState(120);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const composerRef = useRef<View>(null);
  const { currentConfig } = useModel();
  const { getLastUsedMode, setLastUsedMode } = useComposerSettings();

  // Debounce search query to prevent excessive re-renders
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Calculate date range for filter
  const dateRange = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilter) {
      case "today":
        return { dateFrom: today.getTime(), dateTo: now };
      case "week":
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { dateFrom: weekAgo.getTime(), dateTo: now };
      case "month":
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { dateFrom: monthAgo.getTime(), dateTo: now };
      default:
        return { dateFrom: undefined, dateTo: undefined };
    }
  }, [dateFilter]);

  // Build query options based on filter
  const queryOptions = useMemo(() => {
    const options: {
      type?: "journal" | "ai_chat";
      isFavorite?: boolean;
      orderBy?: "createdAt" | "updatedAt";
      order?: "ASC" | "DESC";
      limit?: number;
      dateFrom?: number;
      dateTo?: number;
    } = {
      orderBy: "updatedAt",
      order: "DESC",
      limit: 20, // Paginate 20 items at a time
    };

    if (filter === "journal") {
      options.type = "journal";
    } else if (filter === "ai_chat") {
      options.type = "ai_chat";
    } else if (filter === "favorites") {
      options.isFavorite = true;
    }

    // Apply favorites filter
    if (favoritesOnly) {
      options.isFavorite = true;
    }

    // Apply date range filter
    if (dateRange.dateFrom !== undefined) {
      options.dateFrom = dateRange.dateFrom;
    }
    if (dateRange.dateTo !== undefined) {
      options.dateTo = dateRange.dateTo;
    }

    return options;
  }, [filter, favoritesOnly, dateRange]);

  // Build search options
  const searchOptions = useMemo(() => {
    return {
      query: debouncedSearchQuery,
      type:
        filter === "journal"
          ? ("journal" as const)
          : filter === "ai_chat"
          ? ("ai_chat" as const)
          : undefined,
      isFavorite: favoritesOnly
        ? true
        : filter === "favorites"
        ? true
        : undefined,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      limit: 20,
    };
  }, [debouncedSearchQuery, filter, favoritesOnly, dateRange]);

  // Use search query when search text is present, otherwise use regular query
  const isSearching = debouncedSearchQuery.trim().length > 0;

  const regularQuery = useInfiniteEntries(queryOptions);
  const searchQueryResult = useSearchEntries(searchOptions);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = isSearching ? searchQueryResult : regularQuery;

  // Flatten pages into single array
  const entries = useMemo(() => {
    return data?.pages.flatMap((page) => page.entries) ?? [];
  }, [data]);

  // React Query mutations
  const createEntry = useCreateEntry();
  const toggleFavoriteMutation = useToggleFavorite();
  const updateEntry = useUpdateEntry();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Use refs to stabilize mutation callbacks
  const toggleFavoriteMutationRef = useRef(toggleFavoriteMutation);
  toggleFavoriteMutationRef.current = toggleFavoriteMutation;

  const createEntryRef = useRef(createEntry);
  createEntryRef.current = createEntry;

  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  const onOpenEntryEditorRef = useRef(onOpenEntryEditor);
  onOpenEntryEditorRef.current = onOpenEntryEditor;

  const handleToggleFavorite = useCallback((entry: Entry) => {
    toggleFavoriteMutationRef.current.mutate(entry.id);
  }, []);

  const handleEntryPress = useCallback((entry: Entry) => {
    if (onOpenEntryEditorRef.current) {
      onOpenEntryEditorRef.current(entry.id);
    }
  }, []);

  const handleModeChange = useCallback(
    (newMode: ComposerMode) => {
      // Check if switching to AI mode without a model selected
      if (newMode === "ai" && !currentConfig) {
        Alert.alert(
          "No AI Model Selected",
          "To use AI features, please go to Settings and download an AI model first. We recommend starting with Qwen 3 0.6B (900MB) for the best balance of speed and quality.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Go to Settings",
              onPress: () => {
                if (onOpenSettings) {
                  onOpenSettings();
                }
              },
            },
          ]
        );
        return;
      }
      setComposerMode(newMode);
      // Save the selected mode for next time
      setLastUsedMode(newMode);
    },
    [currentConfig, onOpenSettings, setLastUsedMode]
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
          // Create journal entry using mutation - cache updates automatically
          await createEntryRef.current.mutateAsync({
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
          // Create AI chat conversation using action system
          const { createConversation } = require("./aiChatActions");

          const entryId = await createConversation({
            userMessage: text,
            createEntry: createEntryRef.current,
            updateEntry: updateEntryRef.current,
            llmManager,
            modelConfig: Llama32_1B_Instruct,
          });

          // Navigate to the conversation immediately
          // (AI generation and title generation happen in background)
          if (onOpenEntryEditorRef.current) {
            onOpenEntryEditorRef.current(entryId);
          }
        }
      } catch (error) {
        console.error("Error creating entry:", error);
      }
    },
    [composerMode]
  );

  const handleComposerLayout = useCallback(
    (event: any) => {
      const { height } = event.nativeEvent.layout;
      setComposerHeight(height + insets.bottom);
    },
    [insets.bottom]
  );

  // Load the last used composer mode on mount
  useEffect(() => {
    getLastUsedMode().then((mode) => {
      setComposerMode(mode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Track keyboard height for both platforms
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardWillShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const keyboardWillHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Group entries by day for section headers
  const groupedData = useMemo(() => {
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

    // Convert to flat list with headers
    const flatData: Array<
      { type: "header"; dateKey: string } | { type: "entry"; entry: Entry }
    > = [];
    Array.from(grouped.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([dateKey, dayEntries]) => {
        flatData.push({ type: "header", dateKey });
        dayEntries.forEach((entry) => {
          flatData.push({ type: "entry", entry });
        });
      });

    return flatData;
  }, [entries]);

  const formatDateHeader = useCallback((dateKey: string): string => {
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
  }, []);

  // Render item for FlatList
  const renderItem: ListRenderItem<
    { type: "header"; dateKey: string } | { type: "entry"; entry: Entry }
  > = useCallback(
    ({ item }) => {
      if (item.type === "header") {
        return (
          <Text
            variant="h2"
            style={{
              color: seasonalTheme.textPrimary,
              marginBottom: spacingPatterns.lg,
            }}
          >
            {formatDateHeader(item.dateKey)}
          </Text>
        );
      }

      return (
        <EntryListItem
          entry={item.entry}
          onPress={handleEntryPress}
          onToggleFavorite={handleToggleFavorite}
          seasonalTheme={seasonalTheme}
        />
      );
    },
    [seasonalTheme, formatDateHeader, handleEntryPress, handleToggleFavorite]
  );

  const keyExtractor = useCallback(
    (
      item:
        | { type: "header"; dateKey: string }
        | { type: "entry"; entry: Entry },
      index: number
    ) => {
      if (item.type === "header") {
        return `header-${item.dateKey}`;
      }
      return `entry-${item.entry.id}`;
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDateFilter("all");
    setFavoritesOnly(false);
  }, []);

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) return null;

    // If searching/filtering, show standard empty state
    if (isSearching) {
      return (
        <View style={styles.emptyState}>
          <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
            No results found
          </Text>
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textSecondary,
              marginTop: spacingPatterns.sm,
            }}
          >
            Try adjusting your search or filters
          </Text>
        </View>
      );
    }

    if (filter === "favorites") {
      return (
        <View style={styles.emptyState}>
          <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
            No favorites yet
          </Text>
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textSecondary,
              marginTop: spacingPatterns.sm,
            }}
          >
            Tap the star icon on any entry to favorite it
          </Text>
        </View>
      );
    }

    // Welcome state for new users
    return (
      <View style={styles.emptyState}>
        <Text
          variant="h2"
          style={{
            color: seasonalTheme.textPrimary,
            marginBottom: spacingPatterns.md,
            textAlign: "center",
          }}
        >
          Welcome! 👋
        </Text>
        <Text
          variant="body"
          style={{
            color: seasonalTheme.textSecondary,
            marginBottom: spacingPatterns.lg,
            textAlign: "center",
            lineHeight: 24,
          }}
        >
          Start journaling or chat with your AI assistant using the input below
        </Text>
        <View style={styles.welcomeHints}>
          <View style={styles.welcomeHint}>
            <Ionicons
              name="book-outline"
              size={24}
              color={theme.colors.accent}
            />
            <View style={styles.welcomeHintText}>
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontWeight: "600",
                  marginBottom: spacingPatterns.xxs,
                }}
              >
                Journal Mode
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Write your thoughts, track your day
              </Text>
            </View>
          </View>
          <View style={styles.welcomeHint}>
            <Ionicons
              name="chatbubbles-outline"
              size={24}
              color={theme.colors.accent}
            />
            <View style={styles.welcomeHintText}>
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontWeight: "600",
                  marginBottom: spacingPatterns.xxs,
                }}
              >
                AI Chat Mode
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Get help, brainstorm, or just chat
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [isLoading, seasonalTheme, filter, isSearching]);

  const ListFooterComponent = useCallback(() => {
    if (isFetchingNextPage) {
      return (
        <View style={{ padding: spacingPatterns.lg }}>
          <Text
            variant="body"
            style={{ color: seasonalTheme.textSecondary, textAlign: "center" }}
          >
            Loading more...
          </Text>
        </View>
      );
    }
    return <View style={{ height: composerHeight }} />;
  }, [isFetchingNextPage, composerHeight, seasonalTheme]);

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
                placeholder="Search"
                placeholderTextColor={seasonalTheme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={handleClearSearch}
                  style={styles.clearButton}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={seasonalTheme.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowFilters(!showFilters)}
              style={[
                styles.filterButton,
                {
                  backgroundColor:
                    showFilters || dateFilter !== "all" || favoritesOnly
                      ? seasonalTheme.textPrimary + "15"
                      : "transparent",
                },
              ]}
            >
              <Ionicons
                name="filter-outline"
                size={24}
                color={seasonalTheme.textSecondary}
              />
            </TouchableOpacity>
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

          {/* Filters */}
          {showFilters && (
            <View style={styles.filtersContainer}>
              {/* Date Filter */}
              <View style={styles.filterSection}>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginBottom: spacingPatterns.xs,
                  }}
                >
                  Date Range
                </Text>
                <View style={styles.filterChips}>
                  {(["all", "today", "week", "month"] as const).map((date) => (
                    <TouchableOpacity
                      key={date}
                      onPress={() => {
                        setDateFilter(date);
                        trackEvent("Filter Date", { range: date });
                      }}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor:
                            dateFilter === date
                              ? seasonalTheme.textPrimary + "15"
                              : "transparent",
                          borderColor:
                            dateFilter === date
                              ? seasonalTheme.textPrimary
                              : seasonalTheme.textSecondary + "30",
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textPrimary,
                          fontWeight: dateFilter === date ? "600" : "400",
                        }}
                      >
                        {date === "all"
                          ? "All Time"
                          : date === "today"
                          ? "Today"
                          : date === "week"
                          ? "This Week"
                          : "This Month"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Favorites Toggle */}
              <TouchableOpacity
                onPress={() => {
                  const newValue = !favoritesOnly;
                  setFavoritesOnly(newValue);
                  trackEvent("Filter Favorites", {
                    enabled: newValue.toString(),
                  });
                }}
                style={styles.favoritesToggle}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: favoritesOnly
                        ? seasonalTheme.textPrimary + "15"
                        : "transparent",
                      borderColor: favoritesOnly
                        ? seasonalTheme.textPrimary
                        : seasonalTheme.textSecondary + "30",
                    },
                  ]}
                >
                  {favoritesOnly && (
                    <Ionicons
                      name="checkmark-sharp"
                      size={18}
                      color={seasonalTheme.textPrimary}
                      style={{ fontWeight: "bold" }}
                    />
                  )}
                </View>
                <View style={styles.favoritesLabel}>
                  <Ionicons
                    name="star"
                    size={16}
                    color="#FFA500"
                    style={{ marginRight: spacingPatterns.xs }}
                  />
                  <Text
                    variant="body"
                    style={{ color: seasonalTheme.textPrimary }}
                  >
                    Favorites only
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Model download indicator */}
        <ModelDownloadIndicator />

        {/* Content area with FlatList for better performance */}
        <FlatList
          data={groupedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={[
            groupedData.length > 0 ? styles.content : styles.contentEmpty,
            keyboardHeight > 0 && {
              paddingBottom: keyboardHeight,
            },
          ]}
          refreshing={false}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={20}
          windowSize={21}
          maintainVisibleContentPosition={
            isSearching
              ? {
                  minIndexForVisible: 0,
                  autoscrollToTopThreshold: 100,
                }
              : undefined
          }
        />

        {/* Bottom Composer with Safe Area */}
        <View
          style={[
            styles.bottomComposerContainer,
            keyboardHeight > 0 && {
              bottom:
                Platform.OS === "android"
                  ? keyboardHeight + insets.bottom // Android needs insets
                  : keyboardHeight, // iOS keyboard height already accounts for safe area
            },
          ]}
        >
          <View ref={composerRef} onLayout={handleComposerLayout}>
            <BottomComposer
              mode={composerMode}
              onModeChange={handleModeChange}
              onStartTyping={handleStartTyping}
              onSubmit={handleComposerSubmit}
              isKeyboardVisible={keyboardHeight > 0}
            />
          </View>
        </View>
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
    paddingBottom: spacingPatterns.xs,
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
  clearButton: {
    padding: spacingPatterns.xs,
  },
  filterButton: {
    borderRadius: borderRadius.full,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButton: {
    borderRadius: borderRadius.full,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersContainer: {
    marginTop: spacingPatterns.md,
    gap: spacingPatterns.md,
  },
  filterSection: {
    gap: spacingPatterns.xs,
  },
  filterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacingPatterns.xs,
  },
  filterChip: {
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  favoritesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  favoritesLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    padding: spacingPatterns.screen,
  },
  contentEmpty: {
    padding: spacingPatterns.screen,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.xl * 2,
  },
  welcomeHints: {
    gap: spacingPatterns.md,
    width: "100%",
    maxWidth: 400,
  },
  welcomeHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
  },
  welcomeHintText: {
    flex: 1,
  },
  bottomComposerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
