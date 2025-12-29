import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useDeleteEntry } from "../db/useEntries";
import { deleteEntry, type EntryActionContext } from "../screens/entryActions";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Dialog } from "./Dialog";
import { MenuItem } from "./MenuItem";

export interface FloatingComposerHeaderProps {
  entryId?: number;
  onBack: () => void;
  onBeforeDelete?: (entryId: number) => void; // Optional cleanup before delete (e.g., LLM cleanup)
  disabled?: boolean;
  deleteConfirmTitle?: string;
  deleteConfirmMessage?: string;
}

export function FloatingComposerHeader({
  entryId,
  onBack,
  onBeforeDelete,
  disabled = false,
  deleteConfirmTitle = "Delete Entry",
  deleteConfirmMessage = "Are you sure you want to delete this entry? This action cannot be undone.",
}: FloatingComposerHeaderProps) {
  const seasonalTheme = useSeasonalTheme();
  const [showMenu, setShowMenu] = useState(false);
  const deleteEntryMutation = useDeleteEntry();

  // Action context
  const actionContext = useMemo<EntryActionContext>(
    () => ({
      updateEntry: null as any, // Not used for delete
      deleteEntry: deleteEntryMutation,
      onNavigateBack: onBack,
    }),
    [deleteEntryMutation, onBack],
  );

  const handleDelete = async () => {
    if (!entryId) return;

    try {
      // Call optional cleanup before deleting
      onBeforeDelete?.(entryId);

      // Delete using action
      await deleteEntry(entryId, actionContext, {
        confirmTitle: deleteConfirmTitle,
        confirmMessage: deleteConfirmMessage,
      });
    } catch (error) {
      // Error already handled in action (logged and shown to user)
      if (error instanceof Error && error.message !== "Deletion cancelled") {
        Alert.alert("Error", "Failed to delete entry");
      }
    }
  };

  const ButtonWrapper = Platform.OS === "ios" ? GlassView : View;

  return (
    <>
      {/* Floating Back Button */}
      <View style={[styles.floatingButton, styles.backButtonContainer]}>
        <ButtonWrapper
          {...(Platform.OS === "ios" && {
            glassEffectStyle: "regular",
            tintColor: seasonalTheme.cardBg,
          })}
          style={[
            styles.buttonGlass,
            Platform.OS === "android" && {
              backgroundColor: seasonalTheme.cardBg,
            },
          ]}
        >
          <TouchableOpacity
            onPress={onBack}
            style={styles.button}
            disabled={disabled}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={seasonalTheme.textPrimary}
            />
          </TouchableOpacity>
        </ButtonWrapper>
      </View>

      {/* Floating Settings Button */}
      {entryId && (
        <View style={[styles.floatingButton, styles.settingsButtonContainer]}>
          <ButtonWrapper
            {...(Platform.OS === "ios" && {
              glassEffectStyle: "regular",
              tintColor: seasonalTheme.cardBg,
            })}
            style={[
              styles.buttonGlass,
              Platform.OS === "android" && {
                backgroundColor: seasonalTheme.cardBg,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              style={styles.button}
              disabled={disabled}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={24}
                color={seasonalTheme.textPrimary}
              />
            </TouchableOpacity>
          </ButtonWrapper>
        </View>
      )}

      {/* Settings Menu Modal */}
      <Dialog visible={showMenu} onRequestClose={() => setShowMenu(false)}>
        <MenuItem
          icon="trash-outline"
          label="Delete Entry"
          variant="destructive"
          onPress={() => {
            setShowMenu(false);
            handleDelete();
          }}
        />
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: "absolute",
    top: spacingPatterns.xxs, // Small offset from top
    zIndex: 1000,
  },
  backButtonContainer: {
    left: spacingPatterns.sm,
  },
  settingsButtonContainer: {
    right: spacingPatterns.sm,
  },
  buttonGlass: {
    borderRadius: borderRadius.full,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        // No elevation - it causes transparency issues
      },
    }),
  },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
