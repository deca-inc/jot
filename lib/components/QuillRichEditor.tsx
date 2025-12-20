import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Keyboard,
  Animated,
  useWindowDimensions,
  ScrollView,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import { Text as RNText } from "react-native";
import QuillEditor from "react-native-cn-quill";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns } from "../theme";
import { showKeyboard } from "../../modules/keyboard-module/src";

// Toolbar height: minHeight (44) + paddingVertical (xs * 2) + margins
const TOOLBAR_HEIGHT = 44 + spacingPatterns.xs * 2 + spacingPatterns.xs;

export interface QuillRichEditorRef {
  getHtml: () => Promise<string | undefined>;
  focus: () => void;
  blur: () => void;
}

interface QuillRichEditorProps {
  initialHtml?: string;
  placeholder?: string;
  onChangeHtml?: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  editorPadding?: number;
  autoFocus?: boolean;
  hideToolbar?: boolean;
}

export const QuillRichEditor = forwardRef<
  QuillRichEditorRef,
  QuillRichEditorProps
>(function QuillRichEditor(
  {
    initialHtml = "<p></p>",
    placeholder = "Start writing...",
    onChangeHtml,
    onFocus,
    onBlur,
    editorPadding = spacingPatterns.screen,
    autoFocus = false,
    hideToolbar = false,
  },
  ref
) {
  const seasonalTheme = useSeasonalTheme();
  const editorRef = useRef<QuillEditor>(null);
  const { width: screenWidth } = useWindowDimensions();

  // Responsive sizing
  const isSmallScreen = screenWidth < 375;
  const iconSize = isSmallScreen ? 17 : 19;
  const fontSize = isSmallScreen ? 14 : 15;

  // Keyboard state - initialize as visible if autoFocus is true
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(autoFocus);
  const toolbarAnimation = useRef(new Animated.Value(autoFocus ? 1 : 0)).current;

  // Track formatting state
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    header: 0,
    list: null as string | null,
  });

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    getHtml: async () => {
      return editorRef.current?.getHtml();
    },
    focus: () => {
      editorRef.current?.focus();
    },
    blur: () => {
      editorRef.current?.blur();
    },
  }));

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus) {
      // Small delay to ensure editor is ready
      const timer = setTimeout(() => {
        editorRef.current?.focus();
        // On Android, WebView focus doesn't open keyboard - use native module
        if (Platform.OS === "android") {
          setTimeout(() => {
            showKeyboard();
          }, 100);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Keyboard listeners
  useEffect(() => {
    // Check if keyboard is already visible on mount
    const checkInitialKeyboardState = () => {
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        setKeyboardHeight(metrics.height);
        toolbarAnimation.setValue(1);
      }
    };

    const timer = setTimeout(checkInitialKeyboardState, 100);

    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
        onFocus?.();
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
        onBlur?.();
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
  }, [toolbarAnimation, onFocus, onBlur]);

  // Format handlers
  const toggleBold = useCallback(
    () => editorRef.current?.format("bold", !formatState.bold),
    [formatState.bold]
  );
  const toggleItalic = useCallback(
    () => editorRef.current?.format("italic", !formatState.italic),
    [formatState.italic]
  );
  const toggleUnderline = useCallback(
    () => editorRef.current?.format("underline", !formatState.underline),
    [formatState.underline]
  );
  const toggleStrike = useCallback(
    () => editorRef.current?.format("strike", !formatState.strike),
    [formatState.strike]
  );
  const toggleH1 = useCallback(
    () =>
      editorRef.current?.format("header", formatState.header === 1 ? false : 1),
    [formatState.header]
  );
  const toggleH2 = useCallback(
    () =>
      editorRef.current?.format("header", formatState.header === 2 ? false : 2),
    [formatState.header]
  );
  const toggleH3 = useCallback(
    () =>
      editorRef.current?.format("header", formatState.header === 3 ? false : 3),
    [formatState.header]
  );
  const toggleBulletList = useCallback(
    () =>
      editorRef.current?.format(
        "list",
        formatState.list === "bullet" ? false : "bullet"
      ),
    [formatState.list]
  );
  const toggleOrderedList = useCallback(
    () =>
      editorRef.current?.format(
        "list",
        formatState.list === "ordered" ? false : "ordered"
      ),
    [formatState.list]
  );
  const toggleChecklist = useCallback(() => {
    const isChecklist =
      formatState.list === "unchecked" || formatState.list === "checked";
    editorRef.current?.format("list", isChecklist ? false : "unchecked");
  }, [formatState.list]);

  // PanResponder for toolbar swipe-down to dismiss keyboard
  // Allows horizontal scrolling but detects vertical swipe to dismiss
  const toolbarPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Capture phase - intercept before children (ScrollView) get it
        onMoveShouldSetPanResponderCapture: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          const { dx, dy } = gestureState;
          // Activate if moving down and vertical movement > horizontal movement
          const isVerticalSwipe = dy > 15 && Math.abs(dy) > Math.abs(dx) * 2;
          return isVerticalSwipe;
        },
        onPanResponderGrant: () => {
          // Gesture started
        },
        onPanResponderRelease: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState
        ) => {
          // Dismiss keyboard if swiped down enough
          if (gestureState.dy > 20) {
            // Blur the editor to dismiss WebView keyboard
            editorRef.current?.blur();
            Keyboard.dismiss();
          }
        },
        onPanResponderTerminate: () => {
          // Gesture was interrupted
        },
      }),
    []
  );

  // Handle HTML change - called directly by Quill when content changes
  const handleHtmlChange = useCallback(
    (data: { html: string }) => {
      onChangeHtml?.(data.html);
    },
    [onChangeHtml]
  );

  // Generate custom CSS
  const customStyles = `
    * {
      -webkit-user-select: text;
      user-select: text;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: ${seasonalTheme.gradient.middle};
    }
    .ql-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 18px;
      background-color: ${seasonalTheme.gradient.middle};
    }
    .ql-editor {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 18px;
      line-height: 1.5;
      color: ${seasonalTheme.textPrimary};
      padding: ${editorPadding}px;
      padding-bottom: ${isKeyboardVisible ? 80 : editorPadding}px;
      background-color: ${seasonalTheme.gradient.middle};
      min-height: 100%;
    }
    .ql-editor.ql-blank::before {
      color: ${seasonalTheme.textSecondary} !important;
      font-style: normal !important;
      opacity: 0.7 !important;
    }
    .ql-editor p {
      margin-bottom: 12px;
    }
    .ql-editor h1 {
      font-size: 37px;
      font-weight: bold;
      line-height: 1.2;
      margin-bottom: 12px;
      color: ${seasonalTheme.textPrimary};
    }
    .ql-editor h2 {
      font-size: 29px;
      font-weight: bold;
      line-height: 1.25;
      margin-bottom: 10px;
      color: ${seasonalTheme.textPrimary};
    }
    .ql-editor h3 {
      font-size: 23px;
      font-weight: bold;
      line-height: 1.3;
      margin-bottom: 8px;
      color: ${seasonalTheme.textPrimary};
    }
    .ql-editor ul, .ql-editor ol {
      padding-left: 0 !important;
      margin-left: 0 !important;
      margin-bottom: 16px;
      list-style: none !important;
    }
    .ql-editor li {
      margin-bottom: 4px;
      line-height: 27px;
      padding-left: 28px !important;
      position: relative;
    }
    .ql-editor li::before {
      position: absolute !important;
      left: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      width: 18px !important;
      text-align: center !important;
    }
    .ql-editor ul li::before {
      font-size: 1.2em !important;
    }
    .ql-editor ul > li::marker {
      color: ${seasonalTheme.textPrimary};
      font-size: 0.7em;
    }
    .ql-editor ol > li::marker {
      color: ${seasonalTheme.textPrimary};
    }
    /* Checklist styling */
    .ql-editor ul[data-checked=true],
    .ql-editor ul[data-checked=false] {
      padding-left: 0 !important;
      margin: 0 !important;
      margin-bottom: 0 !important;
    }
    .ql-editor ul[data-checked=true] + :not(ul[data-checked]),
    .ql-editor ul[data-checked=false] + :not(ul[data-checked]) {
      margin-top: 16px !important;
    }
    .ql-editor ul[data-checked=true]:last-child,
    .ql-editor ul[data-checked=false]:last-child {
      margin-bottom: 16px !important;
    }
    .ql-editor ul[data-checked=false] > li,
    .ql-editor ul[data-checked=true] > li {
      padding-left: 28px !important;
      min-height: 27px !important;
      line-height: 27px !important;
      margin: 0 !important;
      margin-bottom: 4px !important;
      position: relative !important;
    }
    .ql-editor ul[data-checked=false] > li {
      color: ${seasonalTheme.textPrimary};
      text-decoration: none;
    }
    .ql-editor ul[data-checked=true] > li {
      color: ${seasonalTheme.textSecondary};
      text-decoration: line-through;
    }
    .ql-editor ul[data-checked=false] > li::before,
    .ql-editor ul[data-checked=true] > li::before {
      content: '' !important;
      font-size: 0 !important;
      color: transparent !important;
      position: absolute !important;
      left: 0 !important;
      top: 4px !important;
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      border-radius: 4px !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      background-size: 12px 12px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      cursor: pointer !important;
      pointer-events: all !important;
    }
    .ql-editor ul[data-checked=false] > li::before {
      border: 2px solid ${seasonalTheme.textSecondary} !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    .ql-editor ul[data-checked=true] > li::before {
      border: 2px solid ${seasonalTheme.textPrimary} !important;
      background-color: ${seasonalTheme.textPrimary} !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${seasonalTheme.isDark ? "%230f172a" : "%23ffffff"}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E") !important;
    }
    .ql-editor blockquote {
      border-left: 4px solid ${seasonalTheme.textSecondary};
      padding-left: 16px;
      margin-left: 0;
      font-style: italic;
      color: ${seasonalTheme.textSecondary};
    }
    .ql-editor pre {
      background-color: ${seasonalTheme.isDark ? "#1e1e1e" : "#f5f5f5"};
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
    }
  `;

  // Render toolbar buttons (shared between iOS and Android)
  const renderToolbarButtons = () => (
    <>
      <TouchableOpacity
        onPress={toggleBold}
        style={[
          styles.toolbarButton,
          formatState.bold && {
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
        onPress={toggleItalic}
        style={[
          styles.toolbarButton,
          formatState.italic && {
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
        onPress={toggleUnderline}
        style={[
          styles.toolbarButton,
          formatState.underline && {
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
        onPress={toggleStrike}
        style={[
          styles.toolbarButton,
          formatState.strike && {
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
        onPress={toggleH1}
        style={[
          styles.toolbarButton,
          formatState.header === 1 && {
            backgroundColor: seasonalTheme.textPrimary + "18",
            borderRadius: 16,
          },
        ]}
      >
        <RNText
          style={[
            styles.toolbarButtonText,
            { color: seasonalTheme.textPrimary, fontSize },
          ]}
        >
          H1
        </RNText>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={toggleH2}
        style={[
          styles.toolbarButton,
          formatState.header === 2 && {
            backgroundColor: seasonalTheme.textPrimary + "18",
            borderRadius: 16,
          },
        ]}
      >
        <RNText
          style={[
            styles.toolbarButtonText,
            { color: seasonalTheme.textPrimary, fontSize },
          ]}
        >
          H2
        </RNText>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={toggleH3}
        style={[
          styles.toolbarButton,
          formatState.header === 3 && {
            backgroundColor: seasonalTheme.textPrimary + "18",
            borderRadius: 16,
          },
        ]}
      >
        <RNText
          style={[
            styles.toolbarButtonText,
            { color: seasonalTheme.textPrimary, fontSize },
          ]}
        >
          H3
        </RNText>
      </TouchableOpacity>
      <View style={styles.toolbarSeparator} />
      <TouchableOpacity
        onPress={toggleBulletList}
        style={[
          styles.toolbarButton,
          formatState.list === "bullet" && {
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
        onPress={toggleOrderedList}
        style={[
          styles.toolbarButton,
          formatState.list === "ordered" && {
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
      <TouchableOpacity
        onPress={toggleChecklist}
        style={[
          styles.toolbarButton,
          (formatState.list === "unchecked" ||
            formatState.list === "checked") && {
            backgroundColor: seasonalTheme.textPrimary + "18",
            borderRadius: 16,
          },
        ]}
      >
        <Ionicons
          name="checkbox-outline"
          size={iconSize}
          color={seasonalTheme.textPrimary}
        />
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Editor */}
      <View
        style={[
          styles.editorContainer,
          {
            paddingBottom: !isKeyboardVisible ? editorPadding : 0,
          },
        ]}
      >
        <QuillEditor
          ref={editorRef}
          style={[
            styles.editor,
            { backgroundColor: seasonalTheme.gradient.middle },
          ]}
          initialHtml={initialHtml}
          quill={{
            placeholder,
            modules: {
              toolbar: false,
              // Disable matchVisual to prevent Quill from inserting extra line breaks
              // before lists when loading HTML (GitHub issue #2905)
              // Note: Must be a string as react-native-cn-quill injects it directly into JS
              clipboard: "{ matchVisual: false }",
            },
          }}
          webview={{
            dataDetectorTypes: Platform.OS === "ios" ? "none" : ["none"],
          }}
          onSelectionChange={(data) => {
            if (data.range) {
              editorRef.current?.getFormat(data.range).then((format: any) => {
                setFormatState({
                  bold: !!format.bold,
                  italic: !!format.italic,
                  underline: !!format.underline,
                  strike: !!format.strike,
                  header: format.header || 0,
                  list: format.list || null,
                });
              });
            }
          }}
          onHtmlChange={handleHtmlChange}
          customStyles={[customStyles]}
          customJS={`
            // Fix for Quill mobile checkbox bug (issues #3781, #2031)
            // On mobile, touch events cause checkbox to toggle twice
            // Solution: Completely take over checkbox click handling
            (function() {
              var lastToggleTime = 0;
              var lastToggleTarget = null;
              var DEBOUNCE_MS = 300;

              // Find the checklist li element from any click target
              function findChecklistLi(target) {
                var el = target;
                while (el && el !== document.body) {
                  if (el.tagName === 'LI') {
                    var ul = el.parentElement;
                    if (ul && ul.hasAttribute('data-checked')) {
                      return { li: el, ul: ul };
                    }
                  }
                  el = el.parentElement;
                }
                return null;
              }

              // Toggle checkbox state
              function toggleCheckbox(li, ul) {
                var now = Date.now();

                // Debounce: prevent double-toggle on same element
                if (lastToggleTarget === li && now - lastToggleTime < DEBOUNCE_MS) {
                  return;
                }
                lastToggleTime = now;
                lastToggleTarget = li;

                // Read current state directly from DOM attribute (source of truth)
                var currentChecked = ul.getAttribute('data-checked');
                var newValue = currentChecked === 'true' ? 'unchecked' : 'checked';

                // Find the blot and get the correct index
                try {
                  // Try finding blot from the li element first
                  var blot = Quill.find(li);

                  // If not found on li, try the ul (some Quill versions map differently)
                  if (!blot) {
                    blot = Quill.find(ul);
                  }

                  // If still not found, try finding from text node inside
                  if (!blot && li.firstChild) {
                    blot = Quill.find(li.firstChild, true);
                  }

                  if (blot && quill) {
                    var index = quill.getIndex(blot);
                    // Use formatLine to change just this line's list format
                    quill.formatLine(index, 1, 'list', newValue, 'user');
                  } else {
                    // Fallback: try to find index by walking DOM and counting
                    console.log('Could not find blot, trying DOM-based index calculation');
                    var allContent = quill.root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre');
                    var lineIndex = 0;
                    for (var i = 0; i < allContent.length; i++) {
                      if (allContent[i] === li) {
                        quill.formatLine(lineIndex, 1, 'list', newValue, 'user');
                        break;
                      }
                      // Add the length of text content plus 1 for the newline
                      lineIndex += (allContent[i].textContent || '').length + 1;
                    }
                  }
                } catch (err) {
                  console.log('Checkbox toggle error:', err);
                }
              }

              // Intercept touch events to prevent Quill's native handler
              document.addEventListener('touchstart', function(e) {
                var result = findChecklistLi(e.target);
                if (result) {
                  // Prevent the touchstart from triggering Quill's native handlers
                  // This stops both touchstart AND the synthetic mousedown that follows
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  toggleCheckbox(result.li, result.ul);
                }
              }, true);

              // Also handle regular mouse clicks (for desktop/testing)
              document.addEventListener('mousedown', function(e) {
                var result = findChecklistLi(e.target);
                if (result) {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  toggleCheckbox(result.li, result.ul);
                }
              }, true);
            })();

            // Auto-focus the editor on load if requested
            ${autoFocus ? `
            (function() {
              // Wait for quill to be ready, then focus
              setTimeout(function() {
                if (typeof quill !== 'undefined') {
                  quill.focus();
                }
              }, 100);
            })();
            ` : ''}
          `}
        />
      </View>

      {/* Floating Toolbar - swipe down to dismiss keyboard */}
      {isKeyboardVisible && !hideToolbar && (
        <Animated.View
          {...toolbarPanResponder.panHandlers}
          style={[
            styles.floatingToolbar,
            {
              // Position above keyboard on both platforms
              bottom: keyboardHeight + (Platform.OS === "android" ? 20 : 4),
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
              style={[
                styles.toolbarContainer,
                // Solid background as fallback when GlassView doesn't render blur
                { backgroundColor: seasonalTheme.cardBg },
              ]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.toolbarScrollView}
                contentContainerStyle={styles.toolbarContent}
              >
                {renderToolbarButtons()}
              </ScrollView>
            </GlassView>
          ) : (
            <View
              style={[
                styles.toolbarContainer,
                { backgroundColor: seasonalTheme.cardBg },
              ]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.toolbarScrollView}
                contentContainerStyle={styles.toolbarContent}
              >
                {renderToolbarButtons()}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
  },
  editor: {
    flex: 1,
  },
  floatingToolbar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  toolbarContainer: {
    borderRadius: 100,
    marginHorizontal: spacingPatterns.md + 4,
    marginBottom: spacingPatterns.xs,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  toolbarScrollView: {
    borderRadius: 100,
  },
  toolbarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    paddingHorizontal: spacingPatterns.sm,
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
  },
  toolbarSeparator: {
    width: 1,
    height: 18,
    backgroundColor: "#888",
    opacity: 0.3,
    marginHorizontal: spacingPatterns.xxs,
  },
});
