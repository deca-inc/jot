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
  Keyboard,
  Animated,
  useColorScheme,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components";
import { Text as RNText } from "react-native";
import { GlassView } from "expo-glass-effect";
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type OnChangeStateEvent,
} from "react-native-enriched";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { typography } from "../theme/typography";
import { Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { blocksToContent } from "./composerUtils";
import { useEntry, useUpdateEntry, useDeleteEntry } from "../db/useEntries";

/**
 * Repairs and sanitizes HTML from the editor
 * Fixes common issues like malformed tags, improper nesting, etc.
 */
function repairHtml(html: string): string {
  let cleaned = html.trim();

  // Remove outer <html> tags if present
  cleaned = cleaned.replace(/^<html>\s*/i, "").replace(/\s*<\/html>$/i, "");

  // Fix: Remove <p> tags that are wrapping block-level elements
  // This fixes the bug where every tag gets wrapped in <p>
  cleaned = cleaned.replace(/<p>\s*(<h[1-6]>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<\/h[1-6]>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<ul>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<ol>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<li>)/gi, "$1");
  cleaned = cleaned.replace(/<p>\s*(<\/li>)/gi, "$1");
  cleaned = cleaned.replace(/(<\/ul>)\s*<\/p>/gi, "$1");
  cleaned = cleaned.replace(/(<\/ol>)\s*<\/p>/gi, "$1");
  cleaned = cleaned.replace(/(<\/h[1-6]>)\s*<\/p>/gi, "$1");

  // Remove ALL <br> tags - they cause rendering issues
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "");

  // Remove empty <p></p> tags
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, "");

  // Remove list items with only empty headings (rendering bug)
  cleaned = cleaned.replace(
    /<li>\s*<h[1-6]>\s*<\/h[1-6]>\s*<\/li>/gi,
    "<li></li>"
  );

  // Clean up empty lists
  cleaned = cleaned.replace(/<ul>\s*<\/ul>/gi, "");
  cleaned = cleaned.replace(/<ol>\s*<\/ol>/gi, "");

  // Fix: if content ends with a list, append empty paragraph to prevent rendering bugs
  if (cleaned.match(/<\/(ul|ol)>\s*$/i)) {
    cleaned = cleaned + "<p></p>";
  }

  return cleaned;
}

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
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive sizing based on screen width
  const isSmallScreen = screenWidth < 375;
  const iconSize = isSmallScreen ? 17 : 19;
  const fontSize = isSmallScreen ? 14 : 15;

  // Use react-query hooks
  const { data: entry, isLoading: isLoadingEntry } = useEntry(entryId);
  const updateEntryMutation = useUpdateEntry();
  const deleteEntryMutation = useDeleteEntry();

  const [title, setTitle] = useState(initialTitle);
  const [htmlContent, setHtmlContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editorState, setEditorState] = useState<OnChangeStateEvent | null>(
    null
  );
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const titleInputRef = useRef<TextInput>(null);
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const shouldAutoFocusRef = useRef(true);
  const performSaveRef = useRef<typeof performSave | null>(null);
  const isDeletingRef = useRef(false); // Track deletion state to prevent race conditions
  const lastLoadedEntryId = useRef<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const toolbarAnimation = useRef(new Animated.Value(0)).current;

  // Load entry content from react-query cache
  useEffect(() => {
    // Only reload if we're loading a different entry
    if (entry && lastLoadedEntryId.current !== entry.id) {
      lastLoadedEntryId.current = entry.id;
      setTitle(entry.title);

      // Check if content is already HTML (new format)
      const markdownBlock = entry.blocks.find((b) => b.type === "markdown");
      let content: string;

      if (markdownBlock && markdownBlock.content.includes("<")) {
        // Already HTML from enriched editor - wrap in <html> tags for the editor
        // Note: We don't repair here to avoid double-repairing (only repair on save)
        content = `<html>${markdownBlock.content}</html>`;
      } else {
        // Legacy format - convert blocks to plain text and let editor handle it
        content = blocksToContent(entry.blocks, entry.type);
      }

      setInitialContent(content);
      setHtmlContent(content);

      // Focus editor after content loads
      if (shouldAutoFocusRef.current) {
        setTimeout(() => {
          editorRef.current?.focus();
        }, 100);
        shouldAutoFocusRef.current = false;
      }
    } else if (
      initialBlocks.length > 0 &&
      !entry &&
      lastLoadedEntryId.current !== entryId
    ) {
      // Load initial blocks from props (when creating new entry from BottomComposer)
      // Just pass plain text directly - editor will format it
      lastLoadedEntryId.current = entryId;
      const text = blocksToContent(initialBlocks, "journal");
      setInitialContent(text);
      setHtmlContent(text);
    }
  }, [entry, entryId, initialBlocks]);

  const performSave = useCallback(
    async (htmlToSave: string) => {
      // Skip if we're in the middle of deleting
      if (isDeletingRef.current) {
        return;
      }

      // Strip HTML to check if there's actual content
      const textContent = htmlToSave.replace(/<[^>]*>/g, "").trim();
      if (!textContent) {
        return;
      }

      setIsSaving(true);
      try {
        // Ensure HTML has proper structure for rendering
        let htmlContent = htmlToSave.trim();

        // If content doesn't have HTML tags, wrap it in a paragraph
        if (!htmlContent.includes("<")) {
          htmlContent = `<p>${htmlContent.replace(/\n/g, "<br>")}</p>`;
        }

        // Repair and sanitize HTML
        htmlContent = repairHtml(htmlContent);

        // Store HTML as single markdown block
        const blocks: Block[] = [
          {
            type: "markdown",
            content: htmlContent,
          },
        ];

        // Use title if set, otherwise use content preview
        const finalTitle =
          title.trim() ||
          textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "") ||
          "Untitled";

        // Always update existing entry using react-query mutation
        await updateEntryMutation.mutateAsync({
          id: entryId,
          input: {
            title: finalTitle,
            blocks,
          },
        });
        onSave?.(entryId);
      } catch (error) {
        console.error("Error saving entry:", error);
        // TODO: Show error message to user
      } finally {
        setIsSaving(false);
      }
    },
    [title, entryId, updateEntryMutation, onSave]
  );

  // Keep ref up to date
  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
        Animated.timing(toolbarAnimation, {
          toValue: 1,
          duration: Platform.OS === "ios" ? 250 : 200,
          useNativeDriver: true,
        }).start();
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setIsKeyboardVisible(false);
        Animated.timing(toolbarAnimation, {
          toValue: 0,
          duration: Platform.OS === "ios" ? 250 : 200,
          useNativeDriver: true,
        }).start(() => {
          setKeyboardHeight(0);
        });
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [toolbarAnimation]);

  // Auto-save with debounce
  useEffect(() => {
    if (!entryId || !htmlContent.trim()) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (1 second debounce)
    saveTimeoutRef.current = setTimeout(async () => {
      if (performSaveRef.current) {
        await performSaveRef.current(htmlContent);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlContent, entryId]);

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
    // Skip if we're in the middle of deleting
    if (isDeletingRef.current) {
      return;
    }

    const newTitle = title.trim();
    setIsSaving(true);
    try {
      await updateEntryMutation.mutateAsync({
        id: entryId,
        input: {
          title: newTitle || undefined,
        },
      });
      onSave?.(entryId);
    } catch (error) {
      console.error("Error updating title:", error);
    } finally {
      setIsSaving(false);
    }
  }, [title, entryId, updateEntryMutation, onSave]);

  const handleTitleSubmit = useCallback(async () => {
    titleInputRef.current?.blur();
    await handleTitleBlur();
  }, [handleTitleBlur]);

  const handleDelete = useCallback(async () => {
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
              // Mark as deleting to prevent save operations
              isDeletingRef.current = true;

              // Clear any pending saves
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
              }

              // Delete using react-query mutation
              await deleteEntryMutation.mutateAsync(entryId);

              onDelete?.(entryId);
              // Navigate away immediately
              onCancel?.();
            } catch (error) {
              console.error("Error deleting entry:", error);
              Alert.alert("Error", "Failed to delete entry");
              isDeletingRef.current = false;
            }
          },
        },
      ]
    );
  }, [entryId, deleteEntryMutation, onDelete, onCancel]);

  // Force save immediately (clears timeout and saves)
  const forceSave = useCallback(async (): Promise<void> => {
    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Save immediately
    if (htmlContent && performSaveRef.current) {
      await performSaveRef.current(htmlContent);
    }
  }, [htmlContent, entryId]);

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
              placeholder="Entry title"
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

      {/* Enriched Editor */}
      <View
        style={[
          styles.editorContainer,
          isKeyboardVisible && {
            marginBottom: 60, // Make room for toolbar
          },
        ]}
      >
        <EnrichedTextInput
          key={`editor-${entryId}-${initialContent.substring(0, 20)}`}
          ref={editorRef}
          defaultValue={initialContent}
          onChangeHtml={(e) => {
            const newHtml = e.nativeEvent.value;
            setHtmlContent(newHtml);
          }}
          onChangeState={(e) => setEditorState(e.nativeEvent)}
          style={{
            fontSize: 18,
            flex: 1,
            color: seasonalTheme.textPrimary,
          }}
          htmlStyle={{
            h1: {
              fontSize: 32,
              bold: true,
            },
            h2: {
              fontSize: 26,
              bold: true,
            },
            h3: {
              fontSize: 22,
              bold: true,
            },
            ul: {
              bulletColor: seasonalTheme.textSecondary,
              bulletSize: 5,
              marginLeft: 20,
              gapWidth: 10,
            },
            ol: {
              markerColor: seasonalTheme.textSecondary,
              markerFontWeight: "normal",
              marginLeft: 20,
              gapWidth: 10,
            },
          }}
          placeholder="Start writing..."
          placeholderTextColor={seasonalTheme.textSecondary}
          autoFocus={shouldAutoFocusRef.current}
        />
      </View>

      {/* Floating Formatting Toolbar - appears above keyboard */}
      {isKeyboardVisible && (
        <Animated.View
          style={[
            styles.floatingToolbar,
            {
              bottom: keyboardHeight,
              opacity: toolbarAnimation,
              transform: [
                {
                  translateY: toolbarAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {Platform.OS === "ios" ? (
            <GlassView
              glassEffectStyle="regular"
              tintColor={seasonalTheme.cardBg}
              style={[styles.glassToolbar, styles.floatingToolbarIOS]}
            >
              <View
                style={[
                  styles.toolbarContent,
                  { backgroundColor: seasonalTheme.cardBg + "F0" },
                ]}
              >
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleBold()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isBold && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontWeight: "bold",
                        fontSize,
                      },
                    ]}
                  >
                    B
                  </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleItalic()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isItalic && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontStyle: "italic",
                        fontSize,
                      },
                    ]}
                  >
                    I
                  </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleUnderline()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isUnderline && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        textDecorationLine: "underline",
                        fontSize,
                      },
                    ]}
                  >
                    U
                  </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleStrikeThrough()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isStrikeThrough && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        textDecorationLine: "line-through",
                        fontSize,
                      },
                    ]}
                  >
                    S
                  </RNText>
                </TouchableOpacity>
                <View style={styles.toolbarSeparator} />
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH1()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH1 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H1
                  </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH2()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH2 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H2
                  </RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH3()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH3 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H3
                  </RNText>
                </TouchableOpacity>
                <View style={styles.toolbarSeparator} />
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleUnorderedList()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isUnorderedList && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Ionicons
                    name="list"
                    size={iconSize}
                    color={seasonalTheme.textPrimary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleOrderedList()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isOrderedList && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <RNText
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize: fontSize - 1,
                        fontWeight: "600",
                      },
                    ]}
                  >
                    123
                  </RNText>
                </TouchableOpacity>
              </View>
            </GlassView>
          ) : (
            <View
              style={[
                styles.androidToolbar,
                styles.floatingToolbarAndroid,
                { backgroundColor: seasonalTheme.cardBg },
              ]}
            >
              <View style={styles.toolbarContent}>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleBold()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isBold && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontWeight: "bold",
                        fontSize,
                      },
                    ]}
                  >
                    B
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleItalic()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isItalic && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontStyle: "italic",
                        fontSize,
                      },
                    ]}
                  >
                    I
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleUnderline()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isUnderline && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        textDecorationLine: "underline",
                        fontSize,
                      },
                    ]}
                  >
                    U
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleStrikeThrough()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isStrikeThrough && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        textDecorationLine: "line-through",
                        fontSize,
                      },
                    ]}
                  >
                    S
                  </Text>
                </TouchableOpacity>
                <View style={styles.toolbarSeparator} />
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH1()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH1 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H1
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH2()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH2 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H2
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleH3()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isH3 && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize,
                      },
                    ]}
                  >
                    H3
                  </Text>
                </TouchableOpacity>
                <View style={styles.toolbarSeparator} />
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleUnorderedList()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isUnorderedList && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Ionicons
                    name="list"
                    size={iconSize}
                    color={seasonalTheme.textPrimary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => editorRef.current?.toggleOrderedList()}
                  style={[
                    styles.toolbarButton,
                    editorState?.isOrderedList && {
                      backgroundColor: seasonalTheme.textPrimary + "18",
                      borderRadius: 16,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolbarButtonText,
                      {
                        color: seasonalTheme.textPrimary,
                        fontSize: fontSize - 1,
                        fontWeight: "600",
                      },
                    ]}
                  >
                    123
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      )}
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
  floatingToolbar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  glassToolbar: {
    overflow: "hidden",
  },
  floatingToolbarIOS: {
    marginHorizontal: spacingPatterns.md + 4,
    marginBottom: spacingPatterns.xs,
    borderRadius: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    overflow: "hidden",
  },
  androidToolbar: {
    // Android gets a solid background
  },
  floatingToolbarAndroid: {
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
    elevation: 8,
  },
  toolbarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xs,
    minHeight: 44,
    gap: spacingPatterns.xxs,
  },
  toolbarButton: {
    paddingHorizontal: spacingPatterns.xxs + 2,
    paddingVertical: spacingPatterns.xs,
    minWidth: 26,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarButtonText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 18,
    includeFontPadding: false,
  },
  toolbarSeparator: {
    width: 1,
    height: 18,
    backgroundColor: "#888",
    opacity: 0.3,
    marginHorizontal: spacingPatterns.xxs,
  },
  editorContainer: {
    flex: 1,
    padding: spacingPatterns.screen,
  },
  richEditor: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
  },
});
