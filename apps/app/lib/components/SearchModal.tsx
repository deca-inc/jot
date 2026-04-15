import { Ionicons } from "@expo/vector-icons";
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
} from "react-native";
import { Entry, extractPreviewText } from "../db/entries";
import { useSearchEntries } from "../db/useEntries";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useDebounce } from "../utils/debounce";
import { PinIcon } from "./icons/PinIcon";
import { Text } from "./Text";

type EntryTypeFilter = "all" | "journal" | "ai_chat" | "countdown";
type DateFilter = "all" | "today" | "week" | "month";

export interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectEntry: (
    entryId: number,
    entryType: "journal" | "ai_chat" | "countdown",
  ) => void;
}

export function SearchModal({
  visible,
  onClose,
  onSelectEntry,
}: SearchModalProps) {
  const seasonalTheme = useSeasonalTheme();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showPinned, setShowPinned] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const dateRange = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilter) {
      case "today":
        return { dateFrom: today.getTime(), dateTo: now };
      case "week": {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { dateFrom: weekAgo.getTime(), dateTo: now };
      }
      case "month": {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { dateFrom: monthAgo.getTime(), dateTo: now };
      }
      default:
        return { dateFrom: undefined, dateTo: undefined };
    }
  }, [dateFilter]);

  const searchOptions = useMemo(
    () => ({
      query: debouncedQuery,
      type: typeFilter !== "all" ? typeFilter : undefined,
      isFavorite: favoritesOnly ? true : undefined,
      includeArchived: includeArchived ? true : undefined,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      limit: 20,
    }),
    [debouncedQuery, typeFilter, favoritesOnly, includeArchived, dateRange],
  );

  const searchResult = useSearchEntries(searchOptions);
  const entries = useMemo(
    () => searchResult.data?.pages.flatMap((page) => page.entries) ?? [],
    [searchResult.data],
  );

  const hasActiveFilters =
    typeFilter !== "all" ||
    dateFilter !== "all" ||
    favoritesOnly ||
    !showPinned ||
    includeArchived;
  const isSearching = debouncedQuery.trim().length > 0 || hasActiveFilters;

  const activeFilterCount = [
    typeFilter !== "all",
    dateFilter !== "all",
    favoritesOnly,
    !showPinned,
    includeArchived,
  ].filter(Boolean).length;

  const handleSelect = useCallback(
    (entry: Entry) => {
      onSelectEntry(
        entry.id,
        entry.type as "journal" | "ai_chat" | "countdown",
      );
      setQuery("");
      setTypeFilter("all");
      setDateFilter("all");
      setFavoritesOnly(false);
      setShowPinned(true);
      setIncludeArchived(false);
      setShowFilters(false);
      onClose();
    },
    [onSelectEntry, onClose],
  );

  const handleClose = useCallback(() => {
    setQuery("");
    setTypeFilter("all");
    setDateFilter("all");
    setFavoritesOnly(false);
    setShowPinned(true);
    setIncludeArchived(false);
    setShowFilters(false);
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => {
      const preview = extractPreviewText(item.blocks);
      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              item.type === "journal"
                ? "create-outline"
                : item.type === "countdown"
                  ? "timer-outline"
                  : "chatbubble-ellipses-outline"
            }
            size={16}
            color={seasonalTheme.textSecondary}
            style={styles.resultIcon}
          />
          <View style={styles.resultText}>
            <Text
              variant="body"
              numberOfLines={1}
              style={{
                color: seasonalTheme.textPrimary,
                fontWeight: "500",
                fontSize: 13,
              }}
            >
              {item.title || "Untitled"}
            </Text>
            {preview ? (
              <Text
                variant="caption"
                numberOfLines={1}
                style={{
                  color: seasonalTheme.textSecondary,
                  fontSize: 12,
                  marginTop: 1,
                }}
              >
                {preview}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [seasonalTheme, handleSelect],
  );

  const chipStyle = useCallback(
    (active: boolean) => [
      styles.chip,
      {
        backgroundColor: active
          ? seasonalTheme.textPrimary + "18"
          : "transparent",
        borderColor: active
          ? seasonalTheme.textPrimary + "40"
          : seasonalTheme.textSecondary + "30",
      },
    ],
    [seasonalTheme],
  );

  const chipTextStyle = useCallback(
    (active: boolean) => ({
      color: seasonalTheme.textPrimary,
      fontSize: 12,
      fontWeight: (active ? "600" : "400") as "600" | "400",
    }),
    [seasonalTheme],
  );

  const checkboxStyle = useCallback(
    (checked: boolean) => [
      styles.checkbox,
      {
        backgroundColor: checked
          ? seasonalTheme.textPrimary + "18"
          : "transparent",
        borderColor: checked
          ? seasonalTheme.textPrimary
          : seasonalTheme.textSecondary + "40",
      },
    ],
    [seasonalTheme],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[
            styles.modal,
            {
              backgroundColor: seasonalTheme.gradient.middle,
              borderColor: seasonalTheme.isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.12)",
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <View
            style={[
              styles.inputRow,
              {
                borderBottomColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={seasonalTheme.textSecondary}
            />
            <TextInput
              style={[
                styles.input,
                { color: seasonalTheme.textPrimary },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-only: remove browser focus outline
                { outlineStyle: "none" } as any,
              ]}
              placeholder="Search entries..."
              placeholderTextColor={seasonalTheme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <TouchableOpacity
              onPress={() => setShowFilters((v) => !v)}
              style={[
                styles.filterToggle,
                {
                  backgroundColor: hasActiveFilters
                    ? seasonalTheme.textPrimary + "15"
                    : "transparent",
                },
              ]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="filter-outline"
                size={16}
                color={
                  hasActiveFilters
                    ? seasonalTheme.textPrimary
                    : seasonalTheme.textSecondary
                }
              />
              {activeFilterCount > 0 && (
                <View
                  style={[
                    styles.filterBadge,
                    { backgroundColor: seasonalTheme.textPrimary },
                  ]}
                >
                  <Text
                    style={{
                      color: seasonalTheme.gradient.middle,
                      fontSize: 9,
                      fontWeight: "700",
                    }}
                  >
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons
                name="close"
                size={20}
                color={seasonalTheme.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Filter dropdown */}
          {showFilters && (
            <View
              style={[
                styles.filtersPanel,
                {
                  borderBottomColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              {/* Entry type */}
              <View style={styles.filterGroup}>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Type
                </Text>
                <View style={styles.chipRow}>
                  {(
                    [
                      { key: "all", label: "All", icon: "apps-outline" },
                      {
                        key: "journal",
                        label: "Note",
                        icon: "create-outline",
                      },
                      {
                        key: "ai_chat",
                        label: "AI Chat",
                        icon: "chatbubbles-outline",
                      },
                      {
                        key: "countdown",
                        label: "Timer",
                        icon: "timer-outline",
                      },
                    ] as const
                  ).map(({ key, label, icon }) => (
                    <TouchableOpacity
                      key={key}
                      style={chipStyle(typeFilter === key)}
                      onPress={() => setTypeFilter(key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={icon}
                        size={12}
                        color={seasonalTheme.textPrimary}
                        style={{ marginRight: 3 }}
                      />
                      <Text style={chipTextStyle(typeFilter === key)}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Date range */}
              <View style={styles.filterGroup}>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Date
                </Text>
                <View style={styles.chipRow}>
                  {(
                    [
                      { key: "all", label: "All Time" },
                      { key: "today", label: "Today" },
                      { key: "week", label: "Week" },
                      { key: "month", label: "Month" },
                    ] as const
                  ).map(({ key, label }) => (
                    <TouchableOpacity
                      key={`date-${key}`}
                      style={chipStyle(dateFilter === key)}
                      onPress={() => setDateFilter(key)}
                      activeOpacity={0.7}
                    >
                      <Text style={chipTextStyle(dateFilter === key)}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Toggles */}
              <View style={styles.togglesRow}>
                <TouchableOpacity
                  style={styles.toggleItem}
                  onPress={() => setFavoritesOnly((v) => !v)}
                >
                  <View style={checkboxStyle(favoritesOnly)}>
                    {favoritesOnly && (
                      <Ionicons
                        name="checkmark-sharp"
                        size={12}
                        color={seasonalTheme.textPrimary}
                      />
                    )}
                  </View>
                  <Ionicons
                    name="star"
                    size={13}
                    color="#FFA500"
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontSize: 12,
                    }}
                  >
                    Favorites
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleItem}
                  onPress={() => setShowPinned((v) => !v)}
                >
                  <View style={checkboxStyle(showPinned)}>
                    {showPinned && (
                      <Ionicons
                        name="checkmark-sharp"
                        size={12}
                        color={seasonalTheme.textPrimary}
                      />
                    )}
                  </View>
                  <PinIcon size={13} color={seasonalTheme.textSecondary} />
                  <Text
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontSize: 12,
                      marginLeft: 3,
                    }}
                  >
                    Pinned
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleItem}
                  onPress={() => setIncludeArchived((v) => !v)}
                >
                  <View style={checkboxStyle(includeArchived)}>
                    {includeArchived && (
                      <Ionicons
                        name="checkmark-sharp"
                        size={12}
                        color={seasonalTheme.textPrimary}
                      />
                    )}
                  </View>
                  <Ionicons
                    name="archive-outline"
                    size={13}
                    color={seasonalTheme.textSecondary}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontSize: 12,
                    }}
                  >
                    Archived
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Results */}
          <FlatList
            data={isSearching ? entries : []}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              isSearching && !searchResult.isLoading ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary }}
                  >
                    No results found
                  </Text>
                </View>
              ) : !isSearching ? (
                <View style={styles.emptyState}>
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary }}
                  >
                    Type to search or use filters
                  </Text>
                </View>
              ) : null
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
  },
  modal: {
    width: "90%",
    maxWidth: 560,
    maxHeight: "70%",
    flex: 1,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterToggle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    padding: 4,
  },
  filtersPanel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  filterGroup: {},
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  togglesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  toggleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  resultIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  emptyState: {
    padding: spacingPatterns.lg,
    alignItems: "center",
  },
});
