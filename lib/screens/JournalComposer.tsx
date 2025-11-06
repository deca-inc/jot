import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { typography } from "../theme/typography";
import { useEntryRepository, Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { blocksToContent } from "./composerUtils";

export interface JournalComposerProps {
  entryId: number;
  initialTitle?: string;
  initialBlocks?: Block[];
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  onDelete?: (entryId: number) => void;
  onBeforeCancel?: () => Promise<void>; // Called before onCancel - parent can call forceSave
  forceSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>; // Ref to expose forceSave to parent
}

export function JournalComposer({
  entryId,
  initialTitle = "",
  initialBlocks = [],
  onSave,
  onCancel,
  onDelete,
  onBeforeCancel,
  forceSaveRef: externalForceSaveRef,
}: JournalComposerProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const entryRepository = useEntryRepository();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleInputRef = useRef<TextInput>(null);
  const contentInputRef = useRef<TextInput>(null);
  const shouldAutoFocusRef = useRef(true);
  const performSaveRef = useRef<typeof performSave | null>(null);

  // Load entry content
  useEffect(() => {
    const loadEntry = async () => {
      try {
        const entry = await entryRepository.getById(entryId);
        if (entry) {
          console.log(
            "Loaded entry",
            entryId,
            "type:",
            entry.type,
            "blocks:",
            entry.blocks.length
          );
          setTitle(entry.title);
          const entryContent = blocksToContent(entry.blocks, entry.type);
          console.log(
            "Entry content loaded, length:",
            entryContent?.length || 0
          );
          setContent(entryContent || "");

          // Focus the input and position cursor at end after content loads
          if (shouldAutoFocusRef.current) {
            setTimeout(() => {
              contentInputRef.current?.focus();
              if (entryContent && entryContent.length > 0) {
                // Position cursor at the end if there's content
                contentInputRef.current?.setNativeProps({
                  selection: {
                    start: entryContent.length,
                    end: entryContent.length,
                  },
                });
              }
            }, 100);
            shouldAutoFocusRef.current = false; // Only autofocus once
          }
        } else {
          console.error("Entry not found:", entryId);
        }
      } catch (error) {
        console.error("Error loading entry:", error);
      }
    };

    loadEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const performSave = useCallback(
    async (contentToSave: string) => {
      if (!contentToSave.trim()) {
        return;
      }

      setIsSaving(true);
      try {
        const blocks: Block[] = [];

        if (contentToSave.trim()) {
          // For journal entries, create paragraph blocks from content
          const paragraphs = contentToSave
            .split("\n\n")
            .filter((p) => p.trim())
            .map((p) => ({
              type: "paragraph" as const,
              content: p.trim(),
            }));

          blocks.push(...paragraphs);
        }

        // Use title if set, otherwise use content preview
        const finalTitle =
          title.trim() ||
          contentToSave.trim().slice(0, 50) +
            (contentToSave.length > 50 ? "..." : "") ||
          "Untitled";

        // Always update existing entry
        await entryRepository.update(entryId, {
          title: finalTitle,
          blocks,
        });
        console.log(
          "Auto-saved entry",
          entryId,
          "with",
          blocks.length,
          "blocks"
        );
        onSave?.(entryId);
      } catch (error) {
        console.error("Error saving entry:", error);
        // TODO: Show error message to user
      } finally {
        setIsSaving(false);
      }
    },
    [title, entryId, entryRepository, onSave]
  );

  // Keep ref up to date
  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  // Auto-save with debounce
  useEffect(() => {
    if (!entryId) {
      return;
    }

    // Don't save empty content
    if (!content.trim()) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (1 second debounce)
    saveTimeoutRef.current = setTimeout(async () => {
      if (performSaveRef.current) {
        console.log("Auto-save executing for entry", entryId);
        await performSaveRef.current(content);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, entryId]);

  const handleTitleFocus = useCallback(() => {
    // Select all text when focusing
    setTimeout(() => {
      titleInputRef.current?.setNativeProps({
        selection: { start: 0, end: title.length },
      });
    }, 100);
  }, [title]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  const handleTitleBlur = useCallback(async () => {
    const newTitle = title.trim();
    setIsSaving(true);
    try {
      await entryRepository.update(entryId, {
        title: newTitle || undefined,
      });
      onSave?.(entryId);
    } catch (error) {
      console.error("Error updating title:", error);
    } finally {
      setIsSaving(false);
    }
  }, [title, entryId, entryRepository, onSave]);

  const handleTitleSubmit = useCallback(async () => {
    titleInputRef.current?.blur();
    await handleTitleBlur();
  }, [handleTitleBlur]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this entry? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Use React Query mutation for proper cache cleanup
              // This ensures cache invalidation happens before navigation
              await entryRepository.delete(entryId);

              // Small delay to ensure database and cache operations complete
              // before navigation to prevent crashes
              await new Promise((resolve) => setTimeout(resolve, 50));

              onDelete?.(entryId);
              // Navigate away after deletion completes
              // Use setTimeout to ensure state updates happen before navigation
              setTimeout(() => {
                onCancel?.();
              }, 0);
            } catch (error) {
              console.error("Error deleting entry:", error);
              Alert.alert("Error", "Failed to delete entry");
            }
          },
        },
      ]
    );
  }, [entryId, entryRepository, onDelete, onCancel]);

  // Force save immediately (clears timeout and saves)
  const forceSave = useCallback(async (): Promise<void> => {
    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Save immediately if there's content
    if (content.trim() && performSaveRef.current) {
      console.log("Force saving entry", entryId, "before navigation");
      await performSaveRef.current(content);
    }
  }, [content, entryId]);

  // Store forceSave in ref for parent access
  const internalForceSaveRef = useRef<typeof forceSave | null>(null);
  useEffect(() => {
    internalForceSaveRef.current = forceSave;
    // Also update external ref if provided
    if (externalForceSaveRef) {
      externalForceSaveRef.current = forceSave;
    }
  }, [forceSave, externalForceSaveRef]);

  // Handle back button - force save before canceling
  const handleBackPress = useCallback(async () => {
    // If parent provided onBeforeCancel, call it (it will use our forceSave)
    if (onBeforeCancel) {
      await onBeforeCancel();
    } else {
      // Otherwise, force save directly
      await forceSave();
    }
    onCancel?.();
  }, [forceSave, onCancel, onBeforeCancel]);

  // Show UI shell immediately - content loads progressively
  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Standardized Header */}
      <View style={styles.standardHeader}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButton}
          disabled={isSaving}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={styles.headerTitleInputWrapper}>
            <TextInput
              ref={titleInputRef}
              style={[
                styles.headerTitleInput,
                { color: seasonalTheme.textPrimary },
              ]}
              value={title}
              onChangeText={handleTitleChange}
              onFocus={handleTitleFocus}
              onBlur={handleTitleBlur}
              onSubmitEditing={handleTitleSubmit}
              placeholder={
                content.trim()
                  ? content.trim().slice(0, 50) +
                    (content.length > 50 ? "..." : "")
                  : "Entry title"
              }
              placeholderTextColor={seasonalTheme.textSecondary}
              editable={true}
              {...(Platform.OS === "android" && {
                includeFontPadding: false,
              })}
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowMenu(true)}
          style={styles.menuButton}
          disabled={isSaving}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
      </View>

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
      <TextInput
        ref={contentInputRef}
        style={[
          styles.fullScreenInput,
          {
            color: seasonalTheme.textPrimary,
            paddingBottom: insets.bottom,
          },
        ]}
        placeholder="Start writing..."
        placeholderTextColor={seasonalTheme.textSecondary}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  standardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  headerTitleContainer: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitleInputWrapper: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    ...(Platform.OS === "ios" && {
      paddingTop: 8,
    }),
  },
  headerTitleInput: {
    width: "100%",
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.fontSize,
    height: typography.h3.fontSize * typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    paddingHorizontal: 0,
    margin: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    ...(Platform.OS === "android" && {
      textAlignVertical: "center",
      includeFontPadding: false,
      paddingVertical: 0,
    }),
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
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
  fullScreenInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
});
