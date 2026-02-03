import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { useTrackEvent } from "../analytics";
import { useThemeSettings } from "../db/themeSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { type Season, type TimeOfDay } from "../theme/seasonalTheme";
import {
  useSeasonalTheme,
  useSeasonalThemeContext,
} from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

interface ThemeControlProps {
  onThemeChange?: () => void;
}

export function ThemeControl({ onThemeChange }: ThemeControlProps = {}) {
  const seasonalTheme = useSeasonalTheme();
  const { getSettings, setSettings } = useThemeSettings();
  const { refreshTheme } = useSeasonalThemeContext();
  const trackEvent = useTrackEvent();

  const [selectedSeason, setSelectedSeason] = useState<Season | "auto">("auto");
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<
    TimeOfDay | "system"
  >("system");
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [showTimeOfDayPicker, setShowTimeOfDayPicker] = useState(false);

  const seasons: (Season | "auto")[] = [
    "auto",
    "spring",
    "summer",
    "autumn",
    "winter",
  ];
  const timeOfDays: (TimeOfDay | "system")[] = ["system", "day", "night"];

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings.mode === "auto") {
          setSelectedSeason("auto");
        } else if (settings.season) {
          setSelectedSeason(settings.season);
        }
        if (settings.timeOfDay) {
          setSelectedTimeOfDay(
            settings.timeOfDay === "system" ? "system" : settings.timeOfDay,
          );
        } else if (settings.useSystemTimeOfDay) {
          setSelectedTimeOfDay("system");
        } else {
          setSelectedTimeOfDay("system");
        }
      } catch (error) {
        console.error("Error loading theme settings:", error);
      }
    };
    loadSettings();
  }, [getSettings]);

  const handleSeasonChange = async (season: Season | "auto") => {
    setSelectedSeason(season);
    trackEvent("Change Theme Season", { season });
    const timeOfDayValue = selectedTimeOfDay || "system";
    await setSettings({
      mode: season === "auto" ? "auto" : "manual",
      season: season === "auto" ? undefined : season,
      timeOfDay:
        timeOfDayValue === "system"
          ? "system"
          : timeOfDayValue === "day"
            ? "day"
            : "night",
      useSystemTimeOfDay: timeOfDayValue === "system",
    });
    await refreshTheme();
    onThemeChange?.();
  };

  const handleTimeOfDayChange = async (timeOfDay: TimeOfDay | "system") => {
    setSelectedTimeOfDay(timeOfDay);
    trackEvent("Change Theme Time", { timeOfDay });
    const seasonValue = selectedSeason === "auto" ? undefined : selectedSeason;
    await setSettings({
      mode: selectedSeason === "auto" ? "auto" : "manual",
      season: seasonValue,
      timeOfDay:
        timeOfDay === "system"
          ? "system"
          : timeOfDay === "day"
            ? "day"
            : "night",
      useSystemTimeOfDay: timeOfDay === "system",
    });
    await refreshTheme();
    onThemeChange?.();
  };

  return (
    <View style={styles.container}>
      {/* Theme Dropdown */}
      <View style={styles.dropdownGroup}>
        <Text
          variant="caption"
          style={[styles.dropdownLabel, { color: seasonalTheme.textSecondary }]}
        >
          Theme
        </Text>
        <TouchableOpacity
          onPress={() => setShowSeasonPicker(true)}
          style={[
            styles.dropdownButton,
            {
              backgroundColor: seasonalTheme.cardBg,
              borderColor: seasonalTheme.textSecondary + "30",
            },
          ]}
        >
          <Text variant="label" style={{ color: seasonalTheme.textPrimary }}>
            {selectedSeason === "auto"
              ? "Auto Theme"
              : selectedSeason.charAt(0).toUpperCase() +
                selectedSeason.slice(1)}
          </Text>
          <Text style={{ color: seasonalTheme.textSecondary }}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Appearance Dropdown */}
      <View style={styles.dropdownGroup}>
        <Text
          variant="caption"
          style={[styles.dropdownLabel, { color: seasonalTheme.textSecondary }]}
        >
          Appearance
        </Text>
        <TouchableOpacity
          onPress={() => setShowTimeOfDayPicker(true)}
          style={[
            styles.dropdownButton,
            {
              backgroundColor: seasonalTheme.cardBg,
              borderColor: seasonalTheme.textSecondary + "30",
            },
          ]}
        >
          <Text variant="label" style={{ color: seasonalTheme.textPrimary }}>
            {selectedTimeOfDay === "system"
              ? "System Default Dark Mode"
              : selectedTimeOfDay === "day"
                ? "Light"
                : "Dark"}
          </Text>
          <Text style={{ color: seasonalTheme.textSecondary }}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Theme Picker Modal */}
      <Modal
        visible={showSeasonPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeasonPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSeasonPicker(false)}
        >
          <View
            style={[
              styles.pickerModal,
              {
                backgroundColor: seasonalTheme.gradient.middle,
                shadowColor: seasonalTheme.subtleGlow.shadowColor,
                shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
              },
            ]}
          >
            {seasons.map((season) => (
              <TouchableOpacity
                key={season}
                onPress={() => {
                  handleSeasonChange(season);
                  setShowSeasonPicker(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedSeason === season && {
                    backgroundColor: seasonalTheme.chipBg,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{
                    color:
                      selectedSeason === season
                        ? seasonalTheme.chipText
                        : seasonalTheme.textPrimary,
                    fontWeight: selectedSeason === season ? "600" : "400",
                  }}
                >
                  {season === "auto"
                    ? "Auto Theme"
                    : season.charAt(0).toUpperCase() + season.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Appearance Picker Modal */}
      <Modal
        visible={showTimeOfDayPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeOfDayPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimeOfDayPicker(false)}
        >
          <View
            style={[
              styles.pickerModal,
              {
                backgroundColor: seasonalTheme.gradient.middle,
                shadowColor: seasonalTheme.subtleGlow.shadowColor,
                shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
              },
            ]}
          >
            {timeOfDays.map((tod) => (
              <TouchableOpacity
                key={tod}
                onPress={() => {
                  handleTimeOfDayChange(tod);
                  setShowTimeOfDayPicker(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedTimeOfDay === tod && {
                    backgroundColor: seasonalTheme.chipBg,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{
                    color:
                      selectedTimeOfDay === tod
                        ? seasonalTheme.chipText
                        : seasonalTheme.textPrimary,
                    fontWeight: selectedTimeOfDay === tod ? "600" : "400",
                  }}
                >
                  {tod === "system"
                    ? "System Default Dark Mode"
                    : tod === "day"
                      ? "Light"
                      : "Dark"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacingPatterns.md,
  },
  dropdownGroup: {
    gap: spacingPatterns.xs,
  },
  dropdownLabel: {
    marginBottom: spacingPatterns.xs,
  },
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerModal: {
    borderRadius: borderRadius.xl,
    padding: spacingPatterns.md,
    minWidth: 250,
    maxWidth: 400,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 40,
    elevation: 8,
    overflow: "hidden",
  },
  pickerItem: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    marginBottom: spacingPatterns.xs,
  },
});
