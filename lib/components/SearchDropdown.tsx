import React, { useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Platform,
  ScrollView,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTrackEvent } from "../analytics";

export interface SearchDropdownProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  dateFilter: "all" | "today" | "week" | "month";
  onDateFilterChange: (filter: "all" | "today" | "week" | "month") => void;
  favoritesOnly: boolean;
  onFavoritesToggle: () => void;
  onOpenSettings?: () => void;
}

export function SearchDropdown({
  searchQuery,
  onSearchChange,
  onClearSearch,
  showFilters,
  onToggleFilters,
  dateFilter,
  onDateFilterChange,
  favoritesOnly,
  onFavoritesToggle,
  onOpenSettings,
}: SearchDropdownProps) {
  const seasonalTheme = useSeasonalTheme();
  const trackEvent = useTrackEvent();
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showFilters) {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false, // maxHeight and marginTop require non-native driver
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false, // maxHeight and marginTop require non-native driver
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showFilters, heightAnim, opacityAnim]);

  const maxHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  const marginTop = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -44], // Animate from 0 to -44
  });

  return (
    <View style={styles.container}>
      {/* Search bar - higher z-index keeps it on top */}
      <View
        style={[
          styles.searchBar,
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
          placeholder="Search your entries..."
          placeholderTextColor={seasonalTheme.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={onClearSearch} style={styles.clearButton}>
            <Ionicons
              name="close-circle"
              size={20}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            onToggleFilters();
            trackEvent("Toggle Filters", { visible: !showFilters });
          }}
          style={[
            styles.iconButton,
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
            size={20}
            color={seasonalTheme.textSecondary}
          />
        </TouchableOpacity>
        {onOpenSettings && (
          <TouchableOpacity onPress={onOpenSettings} style={styles.iconButton}>
            <Ionicons
              name="settings-outline"
              size={20}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters dropdown - lower z-index keeps it below */}
      <Animated.View
        style={[
          styles.dropdownContent,
          {
            maxHeight,
            marginTop, // Animated margin
            opacity: opacityAnim,
            backgroundColor: seasonalTheme.cardBg,
            borderColor: seasonalTheme.textSecondary + "20",
          },
        ]}
        pointerEvents={showFilters ? "auto" : "none"}
      >
        <View style={styles.filtersContainer}>
            {/* Date Filter */}
            <View style={styles.filterSection}>
              <Text
                variant="caption"
                style={{
                  color: seasonalTheme.textSecondary,
                  marginBottom: spacingPatterns.xxs,
                  fontSize: 11,
                }}
              >
                Date Range
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChips}
              >
                {(["all", "today", "week", "month"] as const).map((date) => (
                  <TouchableOpacity
                    key={date}
                    onPress={() => {
                      onDateFilterChange(date);
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
                        fontSize: 12,
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
              </ScrollView>
            </View>

            {/* Favorites Toggle */}
            <TouchableOpacity
              onPress={() => {
                onFavoritesToggle();
                trackEvent("Filter Favorites", {
                  enabled: (!favoritesOnly).toString(),
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
                <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
                  Favorites only
                </Text>
              </View>
            </TouchableOpacity>
          </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacingPatterns.md,
    gap: spacingPatterns.xs,
    zIndex: 2, // Ensure search bar is on top
    position: "relative",
  },
  searchIcon: {
    marginRight: spacingPatterns.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: spacingPatterns.xs,
  },
  clearButton: {
    padding: spacingPatterns.xs,
  },
  iconButton: {
    borderRadius: borderRadius.full,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownContent: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderTopWidth: 0,
    overflow: "hidden",
    zIndex: 1, // Ensure dropdown is below search bar
    position: "relative",
  },
  filtersContainer: {
    padding: spacingPatterns.sm,
    paddingTop: 44 + spacingPatterns.sm, // Push content below search input
    gap: spacingPatterns.sm,
  },
  filterSection: {
    gap: spacingPatterns.xxs,
  },
  filterChips: {
    flexDirection: "row",
    gap: spacingPatterns.xxs,
  },
  filterChip: {
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xxs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  favoritesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xxs,
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
});

