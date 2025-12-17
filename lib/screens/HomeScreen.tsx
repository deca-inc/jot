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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Text,
  EntryListItem,
  ModelDownloadIndicator,
  FloatingActionButton,
  SearchDropdown,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns } from "../theme";
import { Entry } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { DEFAULT_MODEL, getModelById } from "../ai/modelConfig";
import {
  useInfiniteEntries,
  useSearchEntries,
  useCreateEntry,
  useToggleFavorite,
  useUpdateEntry,
} from "../db/useEntries";
import { useModel } from "../ai/ModelProvider";
import { useTrackScreenView, useTrackEvent } from "../analytics";
import { useModelSettings } from "../db/modelSettings";
import { useQueryClient } from "@tanstack/react-query";

type EntryTypeFilter = "all" | "journal" | "ai_chat";

export interface HomeScreenProps {
  refreshKey?: number;
  isVisible?: boolean;
  onOpenFullEditor?: (initialText?: string) => void;
  onOpenSettings?: () => void;
  onOpenEntryEditor?: (entryId: number) => void;
}

export function HomeScreen(props: HomeScreenProps = {}) {
  const { onOpenFullEditor, onOpenSettings, onOpenEntryEditor, isVisible = true } = props;
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();

  // Track screen view
  useTrackScreenView("Home");
  const trackEvent = useTrackEvent();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>("all");
  const { currentConfig } = useModel();
  const modelSettings = useModelSettings();
  const [selectedModelConfig, setSelectedModelConfig] = useState(DEFAULT_MODEL);
  const queryClient = useQueryClient();

  // FAB menu state
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  // Load selected model from settings ONCE on mount
  useEffect(() => {
    async function loadSelectedModel() {
      const selectedModelId = await modelSettings.getSelectedModelId();
      if (selectedModelId) {
        const config = getModelById(selectedModelId);
        if (config) {
          setSelectedModelConfig(config);
        } else {
          setSelectedModelConfig(DEFAULT_MODEL);
        }
      } else {
        setSelectedModelConfig(DEFAULT_MODEL);
      }
    }
    loadSelectedModel();
  }, []); // Empty deps - only run once on mount

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

  // Build unified query options for all entries
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
      limit: 20,
    };

    // Apply entry type filter
    if (entryTypeFilter !== "all") {
      options.type = entryTypeFilter;
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
  }, [entryTypeFilter, favoritesOnly, dateRange]);

  // Build search options
  const searchOptions = useMemo(() => {
    return {
      query: debouncedSearchQuery,
      type: entryTypeFilter !== "all" ? entryTypeFilter : undefined,
      isFavorite: favoritesOnly ? true : undefined,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      limit: 20,
    };
  }, [debouncedSearchQuery, entryTypeFilter, favoritesOnly, dateRange]);

  // Use search query when search text is present, otherwise use regular query
  const isSearching = debouncedSearchQuery.trim().length > 0;

  // Single unified query for all entries
  const regularQuery = useInfiniteEntries(queryOptions);
  const searchQueryResult = useSearchEntries(searchOptions);

  // Unified entries list
  const entriesQuery = isSearching ? searchQueryResult : regularQuery;
  const entries = useMemo(() => {
    return entriesQuery.data?.pages.flatMap((page) => page.entries) ?? [];
  }, [entriesQuery.data]);

  // React Query mutations
  const createEntry = useCreateEntry();
  const toggleFavoriteMutation = useToggleFavorite();
  const updateEntry = useUpdateEntry();

  const handleRefresh = useCallback(() => {
    entriesQuery.refetch();
  }, [entriesQuery]);

  const handleLoadMore = useCallback(() => {
    if (entriesQuery.hasNextPage && !entriesQuery.isFetchingNextPage) {
      entriesQuery.fetchNextPage();
    }
  }, [entriesQuery]);

  // Refetch when screen becomes visible (after navigating back)
  const wasVisibleRef = useRef(isVisible);
  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      // Screen just became visible - refetch data
      regularQuery.refetch();
    }
    wasVisibleRef.current = isVisible;
  }, [isVisible, regularQuery]);

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

  // FAB menu handlers
  const handleCreateJournalEntry = useCallback(() => {
    setFabMenuOpen(false);
    if (onOpenFullEditor) {
      onOpenFullEditor();
    }
  }, [onOpenFullEditor]);

  const handleCreateAIChat = useCallback(async () => {
    setFabMenuOpen(false);

    // Check if AI model is available
    if (!currentConfig) {
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

    try {
      // Create a new AI chat entry and navigate to it
      const entry = await createEntryRef.current.mutateAsync({
        type: "ai_chat",
        title: "New Chat",
        blocks: [],
        tags: [],
        attachments: [],
        isFavorite: false,
      });

      // Navigate to the new chat
      if (onOpenEntryEditorRef.current) {
        onOpenEntryEditorRef.current(entry.id);
      }
    } catch (error) {
      console.error("Error creating AI chat:", error);
    }
  }, [currentConfig, onOpenSettings]);

  const handleFABPress = useCallback(() => {
    setFabMenuOpen((prev) => !prev);
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
    if (entriesQuery.isLoading) return null;

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

    if (favoritesOnly) {
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
          Welcome!
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
          Tap the + button to get started
        </Text>
        <View style={styles.welcomeHints}>
          <TouchableOpacity
            style={styles.welcomeHint}
            onPress={handleCreateJournalEntry}
            activeOpacity={0.7}
          >
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
                New Journal Entry
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Write your thoughts, track your day
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.welcomeHint}
            onPress={handleCreateAIChat}
            activeOpacity={0.7}
          >
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
                New AI Chat
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Get help, brainstorm, or just chat
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    entriesQuery.isLoading,
    seasonalTheme,
    favoritesOnly,
    isSearching,
    theme,
    handleCreateJournalEntry,
    handleCreateAIChat,
  ]);

  const ListFooterComponent = useMemo(() => {
    if (entriesQuery.isFetchingNextPage) {
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
    return <View style={{ height: 100 }} />; // Space for FAB
  }, [entriesQuery.isFetchingNextPage, seasonalTheme]);

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
          entryTypeFilter={entryTypeFilter}
          onEntryTypeFilterChange={setEntryTypeFilter}
          onOpenSettings={onOpenSettings}
        />

        {/* Model download indicator */}
        <ModelDownloadIndicator />

        {/* Unified entries list */}
        <FlatList
          data={groupedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={[
            groupedData.length > 0 ? styles.content : styles.contentEmpty,
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

        {/* FAB with speed dial menu */}
        <FloatingActionButton
          onPress={handleFABPress}
          isOpen={fabMenuOpen}
          onCreateJournal={handleCreateJournalEntry}
          onCreateAIChat={handleCreateAIChat}
          onClose={() => setFabMenuOpen(false)}
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
  content: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: 8,
    paddingBottom: spacingPatterns.screen,
  },
  contentEmpty: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: 8,
    paddingBottom: spacingPatterns.screen,
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
