import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { Text } from "./Text";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useDeleteEntry } from "../db/useEntries";
import { deleteEntry, type EntryActionContext } from "../screens/entryActions";

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
    [deleteEntryMutation, onBack]
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
              backgroundColor: seasonalTheme.cardBg + "F0",
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
                backgroundColor: seasonalTheme.cardBg + "F0",
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
      {showMenu && (
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setShowMenu(false)}
          >
            <View
              style={[
                styles.menuContainer,
                {
                  backgroundColor: seasonalTheme.cardBg,
                  shadowColor: seasonalTheme.subtleGlow.shadowColor,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  handleDelete();
                }}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#FF3B30"
                  style={styles.menuIcon}
                />
                <Text style={{ color: "#FF3B30" }}>Delete Entry</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
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
        elevation: 4,
      },
    }),
  },
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    minWidth: 200,
    borderRadius: borderRadius.lg,
    padding: spacingPatterns.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
  },
  menuIcon: {
    marginRight: spacingPatterns.sm,
  },
});
