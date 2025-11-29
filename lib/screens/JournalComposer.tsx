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
} from "@deca-inc/react-native-enriched";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useEntry, useUpdateEntry } from "../db/useEntries";
import { debounce } from "../utils/debounce";
import { FloatingComposerHeader } from "../components";
import { saveJournalContent, repairHtml } from "./journalActions";
import { useTrackScreenView } from "../analytics";

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

  // Track screen view
  useTrackScreenView("Journal Composer");
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive sizing based on screen width
  const isSmallScreen = screenWidth < 375;
  const iconSize = isSmallScreen ? 17 : 19;
  const fontSize = isSmallScreen ? 14 : 15;

  // Use react-query hooks
  const { data: entry, isLoading: isLoadingEntry } = useEntry(entryId);
  const updateEntryMutation = useUpdateEntry();

  // Stabilize mutation and callbacks with refs
  const updateEntryMutationRef = useRef(updateEntryMutation);
  updateEntryMutationRef.current = updateEntryMutation;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const onBeforeCancelRef = useRef(onBeforeCancel);
  onBeforeCancelRef.current = onBeforeCancel;

  const [htmlContent, setHtmlContent] = useState(""); // Track current editor content for debounced save
  const [editorState, setEditorState] = useState<OnChangeStateEvent | null>(
    null
  );
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const isDeletingRef = useRef(false); // Track deletion state to prevent race conditions
  const lastLoadTimeRef = useRef<number>(0); // Track when we last loaded content
  const [editorKey, setEditorKey] = useState(() => Date.now()); // Force fresh editor on each mount
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Initialize keyboard as visible since we use autoFocus={true} on the input
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(true);
  // Initialize animation to 1 so toolbar appears immediately when keyboard is already visible
  const toolbarAnimation = useRef(new Animated.Value(1)).current;

  // Derive initial content from entry (single source of truth)
  const initialContent = useMemo(() => {
    if (!entry) return "";

    const markdownBlock = entry.blocks.find((b) => b.type === "markdown");
    if (markdownBlock && markdownBlock.content.includes("<")) {
      // Already HTML from enriched editor
      let content = markdownBlock.content;

      // Fix corrupted data: If HTML is escaped, unescape it
      if (content.includes("&lt;") || content.includes("&gt;")) {
        content = content
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }

      // Mark that we just loaded content - used to detect editor normalization
      lastLoadTimeRef.current = Date.now();
      return content;
    }

    // Empty or no content
    return "";
  }, [entry]);

  // Create action context for journal operations (stable object that accesses current refs)
  const actionContext = useMemo(
    () => ({
      get updateEntry() {
        return updateEntryMutationRef.current;
      },
      get createEntry() {
        return updateEntryMutationRef.current;
      },
      get onSave() {
        return onSaveRef.current;
      },
    }),
    [] // Now stable!
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
    // Check if keyboard is already visible on mount (for when navigating to this screen)
    const checkInitialKeyboardState = () => {
      // On iOS, metrics() returns the current keyboard frame
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        setKeyboardHeight(metrics.height);
        // Already initialized to visible, but ensure animation is at 1
        toolbarAnimation.setValue(1);
      }
    };

    // Small delay to ensure keyboard has time to render if autoFocus triggers it
    const timer = setTimeout(checkInitialKeyboardState, 100);

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
      clearTimeout(timer);
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
    if (onBeforeCancelRef.current) {
      await onBeforeCancelRef.current();
    } else {
      // Otherwise, force save directly
      await forceSave();
    }
    onCancelRef.current?.();
  }, [forceSave]); // Only depends on forceSave now

  // Show UI shell immediately - content loads progressively
  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
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
            paddingBottom: !isKeyboardVisible ? spacingPatterns.screen : 0,
            // Shrink container by keyboard height on Android only
            // iOS: container keeps full height, toolbar just floats
            marginBottom:
              Platform.OS === "android" && isKeyboardVisible
                ? keyboardHeight + insets.bottom
                : 0,
          },
        ]}
      >
        {initialContent !== undefined && (
          <EnrichedTextInput
            key={`editor-${entryId}-${entry?.updatedAt || editorKey}`}
            ref={editorRef}
            defaultValue={initialContent}
            onChangeHtml={(e) => {
              const newHtml = e.nativeEvent.value;

              // Detect if this is the editor's internal normalization right after loading
              // The library strips trailing <br> and <p></p> tags - this is intentional library behavior
              // Ignore these changes to prevent overwriting DB with normalized version
              const timeSinceLoad = Date.now() - lastLoadTimeRef.current;
              if (timeSinceLoad < 250) {
                setHtmlContent(newHtml);
                return; // Don't trigger save for editor normalization
              }

              setHtmlContent(newHtml);
              // Event-based auto-save: directly call debounced function
              debouncedSave(newHtml);
            }}
            onChangeState={(e) => setEditorState(e.nativeEvent)}
            style={{
              fontSize: 18,
              flex: 1,
              color: seasonalTheme.textPrimary,
              lineHeight: 25,
              paddingBottom: isKeyboardVisible
                ? Platform.OS === "android"
                  ? 62 // Just toolbar (~60) + 2px margin
                  : 120 // not sure, just looks good?
                : spacingPatterns.screen,
            }}
            htmlStyle={{
              h1: {
                fontSize: 37, // Golden ratio: 18 × 1.618²
                bold: true,
                lineSpacing: 11,
                spacingBefore: 47,
                spacingAfter: 18,
              },
              h2: {
                fontSize: 29, // Golden ratio: 18 × 1.618
                bold: true,
                lineSpacing: 11,
                spacingBefore: 37,
                spacingAfter: 18,
              },
              h3: {
                fontSize: 23, // Golden ratio scale
                bold: true,
                lineSpacing: 11,
                spacingBefore: 29,
                spacingAfter: 11,
              },
              ul: {
                bulletColor: seasonalTheme.textPrimary,
                bulletSize: 8,
                marginLeft: 18,
                gapWidth: 18,
                lineSpacing: 25, // Match base lineHeight
                itemSpacing: 6,
                spacingBefore: 29,
              },
              ol: {
                markerColor: seasonalTheme.textPrimary,
                markerFontWeight: "normal",
                marginLeft: 18,
                gapWidth: 18,
                lineSpacing: 25, // Match base lineHeight
                itemSpacing: 6,
                spacingBefore: 29,
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
              bottom:
                Platform.OS === "android"
                  ? keyboardHeight + insets.bottom // Android needs insets
                  : keyboardHeight + 4, // iOS: add 4px margin from keyboard
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
    // Android gets a solid background with rounded pill shape
  },
  floatingToolbarAndroid: {
    borderRadius: 100, // Full pill shape
    marginHorizontal: spacingPatterns.md + 4,
    marginBottom: spacingPatterns.xs,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
