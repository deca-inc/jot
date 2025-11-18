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
  TouchableOpacity,
  ListRenderItem,
  Alert,
  Dimensions,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Text,
  EntryListItem,
  ModelDownloadIndicator,
  Footer,
  FloatingActionButton,
  AIComposerInput,
  SearchDropdown,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns } from "../theme";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { currentConfig } = useModel();
  const { getLastUsedMode, setLastUsedMode } = useComposerSettings();

  // Screen dimensions for swipeable pages
  const screenWidth = Dimensions.get("window").width;
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const isProgrammaticScroll = useRef(false);

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

  // Build query options for JOURNAL entries
  const journalQueryOptions = useMemo(() => {
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
      limit: 20,
      type: "journal",
    };

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

  // Build query options for AI CHAT entries
  const aiQueryOptions = useMemo(() => {
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
      limit: 20,
      type: "ai_chat",
    };

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

  // Separate queries for journal and AI
  const journalRegularQuery = useInfiniteEntries(journalQueryOptions);
  const aiRegularQuery = useInfiniteEntries(aiQueryOptions);
  const searchQueryResult = useSearchEntries(searchOptions);

  // Journal data
  const journalData = isSearching ? searchQueryResult : journalRegularQuery;
  const journalEntries = useMemo(() => {
    if (isSearching) {
      // Filter search results to only show journal entries
      return (
        searchQueryResult.data?.pages.flatMap((page) => page.entries) ?? []
      ).filter((entry) => entry.type === "journal");
    }
    return journalData.data?.pages.flatMap((page) => page.entries) ?? [];
  }, [journalData.data, isSearching, searchQueryResult.data]);

  // AI data
  const aiData = isSearching ? searchQueryResult : aiRegularQuery;
  const aiEntries = useMemo(() => {
    if (isSearching) {
      // Filter search results to only show AI entries
      return (
        searchQueryResult.data?.pages.flatMap((page) => page.entries) ?? []
      ).filter((entry) => entry.type === "ai_chat");
    }
    return aiData.data?.pages.flatMap((page) => page.entries) ?? [];
  }, [aiData.data, isSearching, searchQueryResult.data]);

  // Use the appropriate data based on current mode for loading states
  const currentData = composerMode === "journal" ? journalData : aiData;

  // React Query mutations
  const createEntry = useCreateEntry();
  const toggleFavoriteMutation = useToggleFavorite();
  const updateEntry = useUpdateEntry();

  const handleRefresh = useCallback(() => {
    if (composerMode === "journal") {
      journalData.refetch();
    } else {
      aiData.refetch();
    }
  }, [composerMode, journalData, aiData]);

  const handleLoadMore = useCallback(() => {
    if (composerMode === "journal") {
      if (journalData.hasNextPage && !journalData.isFetchingNextPage) {
        journalData.fetchNextPage();
      }
    } else {
      if (aiData.hasNextPage && !aiData.isFetchingNextPage) {
        aiData.fetchNextPage();
      }
    }
  }, [composerMode, journalData, aiData]);

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

      // Mark as programmatic scroll to prevent handleScroll from interfering
      isProgrammaticScroll.current = true;

      // Scroll to the appropriate page
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          x: newMode === "journal" ? 0 : screenWidth,
          animated: true,
        });
      }
    },
    [currentConfig, onOpenSettings, setLastUsedMode, screenWidth]
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

  const handleFABPress = useCallback(() => {
    if (onOpenFullEditor) {
      onOpenFullEditor();
    }
  }, [onOpenFullEditor]);

  // Load the last used composer mode on mount
  useEffect(() => {
    getLastUsedMode().then((mode) => {
      setComposerMode(mode);
      // Scroll to correct page after mode is loaded
      if (scrollViewRef.current) {
        // Use timeout to ensure layout is ready
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            x: mode === "journal" ? 0 : screenWidth,
            animated: false,
          });
        }, 100);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle scroll events to update mode based on page
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        // Ignore scroll events during programmatic scrolls (from footer taps)
        if (isProgrammaticScroll.current) {
          return;
        }

        const offsetX = event.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / screenWidth);
        const newMode: ComposerMode = page === 0 ? "journal" : "ai";

        if (newMode !== composerMode) {
          setComposerMode(newMode);
          setLastUsedMode(newMode);
        }
      },
    }
  );

  // Reset programmatic scroll flag when scroll ends
  const handleScrollEnd = useCallback(() => {
    isProgrammaticScroll.current = false;
  }, []);

  // Group journal entries by day for section headers
  const journalGroupedData = useMemo(() => {
    const grouped = new Map<string, Entry[]>();

    journalEntries.forEach((entry) => {
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
  }, [journalEntries]);

  // Group AI entries by day for section headers
  const aiGroupedData = useMemo(() => {
    const grouped = new Map<string, Entry[]>();

    aiEntries.forEach((entry) => {
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
  }, [aiEntries]);

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

  const createListEmptyComponent = useCallback(
    (mode: ComposerMode) => {
      if (currentData.isLoading) return null;

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
            {mode === "journal"
              ? "Tap the + button to start journaling"
              : "Use the input below to chat with your AI assistant"}
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
    },
    [currentData.isLoading, seasonalTheme, filter, isSearching, theme]
  );

  const JournalListEmptyComponent = useMemo(
    () => createListEmptyComponent("journal"),
    [createListEmptyComponent]
  );

  const AIListEmptyComponent = useMemo(
    () => createListEmptyComponent("ai"),
    [createListEmptyComponent]
  );

  const createListFooterComponent = useCallback(
    (mode: ComposerMode) => {
      const isFetching =
        mode === "journal"
          ? journalData.isFetchingNextPage
          : aiData.isFetchingNextPage;

      if (isFetching) {
        return (
          <View style={{ padding: spacingPatterns.lg }}>
            <Text
              variant="body"
              style={{
                color: seasonalTheme.textSecondary,
                textAlign: "center",
              }}
            >
              Loading more...
            </Text>
          </View>
        );
      }
      return <View style={{ height: 140 }} />; // Space for footer + FAB/AI input
    },
    [journalData.isFetchingNextPage, aiData.isFetchingNextPage, seasonalTheme]
  );

  const JournalListFooterComponent = useCallback(
    () => createListFooterComponent("journal"),
    [createListFooterComponent]
  );

  const AIListFooterComponent = useCallback(
    () => createListFooterComponent("ai"),
    [createListFooterComponent]
  );

  return (
    <View
      style={[
        styles.gradient,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <View style={styles.container}>
        {/* Search dropdown */}
        <SearchDropdown
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClearSearch={handleClearSearch}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          favoritesOnly={favoritesOnly}
          onFavoritesToggle={() => setFavoritesOnly(!favoritesOnly)}
          onOpenSettings={onOpenSettings}
        />

        {/* Model download indicator */}
        <ModelDownloadIndicator />

        {/* Swipeable content area with horizontal pages */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleScrollEnd}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
        >
          {/* Journal Page */}
          <View style={[styles.page, { width: screenWidth }]}>
            <FlatList
              data={journalGroupedData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ListEmptyComponent={JournalListEmptyComponent}
              ListFooterComponent={JournalListFooterComponent}
              contentContainerStyle={[
                journalGroupedData.length > 0
                  ? styles.content
                  : styles.contentEmpty,
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
            />
            {/* FAB inside journal page so it moves with the screen */}
            <FloatingActionButton
              onPress={handleFABPress}
              scrollX={scrollX}
              screenWidth={screenWidth}
            />
          </View>

          {/* AI Page */}
          <View style={[styles.page, { width: screenWidth }]}>
            <FlatList
              data={aiGroupedData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ListEmptyComponent={AIListEmptyComponent}
              ListFooterComponent={AIListFooterComponent}
              contentContainerStyle={[
                aiGroupedData.length > 0 ? styles.content : styles.contentEmpty,
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
            />
          </View>
        </ScrollView>

        {/* Footer with mode switcher */}
        <Footer mode={composerMode} onModeChange={handleModeChange} />

        {/* AI input (conditionally visible) */}
        <AIComposerInput
          onSubmit={handleComposerSubmit}
          visible={composerMode === "ai"}
          scrollX={scrollX}
          screenWidth={screenWidth}
        />
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
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexDirection: "row",
  },
  page: {
    flex: 1,
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
});
