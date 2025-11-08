import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
  Animated,
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
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useEntry, useUpdateEntry, useDeleteEntry } from "../db/useEntries";
import { debounce } from "../utils/debounce";
import { FloatingComposerHeader } from "../components";
import { saveJournalContent, repairHtml } from "./journalActions";

export interface JournalComposerProps {
  entryId: number;
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  onBeforeCancel?: () => Promise<void>; // Called before onCancel - parent can call forceSave
  forceSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>; // Ref to expose forceSave to parent
}

export function JournalComposer({
  entryId,
  onSave,
  onCancel,
  onBeforeCancel,
  forceSaveRef: externalForceSaveRef,
}: JournalComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive sizing based on screen width
  const isSmallScreen = screenWidth < 375;
  const iconSize = isSmallScreen ? 17 : 19;
  const fontSize = isSmallScreen ? 14 : 15;

  // Use react-query hooks
  const { data: entry, isLoading: isLoadingEntry } = useEntry(entryId);
  const updateEntryMutation = useUpdateEntry();

  const [htmlContent, setHtmlContent] = useState(""); // Track current editor content for debounced save
  const [editorState, setEditorState] = useState<OnChangeStateEvent | null>(
    null
  );
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const isDeletingRef = useRef(false); // Track deletion state to prevent race conditions
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const toolbarAnimation = useRef(new Animated.Value(0)).current;

  // Derive initial content from entry (single source of truth)
  const initialContent = useMemo(() => {
    if (!entry) return "";

    const markdownBlock = entry.blocks.find((b) => b.type === "markdown");
    if (markdownBlock && markdownBlock.content.includes("<")) {
      // Already HTML from enriched editor - wrap in <html> tags for the editor
      return `<html>${markdownBlock.content}</html>`;
    }

    // Empty or no content
    return "";
  }, [entry]);

  // Create action context for journal operations
  const actionContext = useMemo(
    () => ({
      updateEntry: updateEntryMutation,
      createEntry: updateEntryMutation, // Not used in save, but required by interface
      onSave,
    }),
    [updateEntryMutation, onSave]
  );

  // Create debounced save function that calls journalActions
  const debouncedSave = useMemo(
    () =>
      debounce(async (htmlToSave: string) => {
        if (isDeletingRef.current || !entryId || !htmlToSave.trim()) return;

        try {
          // Repair HTML before saving
          const repairedHtml = repairHtml(htmlToSave);
          await saveJournalContent(entryId, repairedHtml, "", actionContext);
        } catch (error) {
          console.error("[JournalComposer] Error saving:", error);
        }
      }, 1000),
    [entryId, actionContext]
  );

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      (debouncedSave as any).cancel();
    };
  }, [debouncedSave]);

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

  // Note: Auto-save is now event-based via debouncedSave in onChange handler
  // No reactive useEffect needed!

  const handleBeforeDelete = useCallback(() => {
    // Mark as deleting to prevent save operations
    isDeletingRef.current = true;

    // Cancel any pending debounced saves
    (debouncedSave as any).cancel();
  }, [debouncedSave]);

  // Force save immediately (flushes debounced save)
  const forceSave = useCallback(async (): Promise<void> => {
    if (isDeletingRef.current || !htmlContent.trim()) return;

    // Cancel pending debounced save and save immediately
    (debouncedSave as any).cancel();

    try {
      const repairedHtml = repairHtml(htmlContent);
      await saveJournalContent(entryId, repairedHtml, "", actionContext);
    } catch (error) {
      console.error("[JournalComposer] Error force saving:", error);
    }
  }, [htmlContent, entryId, actionContext, debouncedSave]);

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
      {/* Floating Header Buttons */}
      <FloatingComposerHeader
        entryId={entryId}
        onBack={handleBackPress}
        onBeforeDelete={handleBeforeDelete}
        disabled={updateEntryMutation.isPending}
      />

      {/* Enriched Editor */}
      <View
        style={[
          styles.editorContainer,
          {
            paddingTop: insets.top,
          },
          isKeyboardVisible && {
            marginBottom: 60, // Make room for toolbar
          },
        ]}
      >
        {initialContent !== undefined && (
          <EnrichedTextInput
            key={`editor-${entryId}`}
            ref={editorRef}
            defaultValue={initialContent}
            onChangeHtml={(e) => {
              const newHtml = e.nativeEvent.value;
              setHtmlContent(newHtml);
              // Event-based auto-save: directly call debounced function
              debouncedSave(newHtml);
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
            autoFocus={true}
          />
        )}
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
    paddingHorizontal: spacingPatterns.screen,
    paddingBottom: spacingPatterns.screen,
    // paddingTop is dynamic based on safe area insets
  },
  richEditor: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
  },
});
