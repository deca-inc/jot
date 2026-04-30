/**
 * Context that provides a single persistent QuillRichEditor WebView
 * shared across all journal entry navigations. This eliminates the ~1s
 * WebView boot cost on every entry open.
 *
 * The QuillRichEditor is rendered inside the Provider (at the layout level,
 * outside the Expo Router Slot) so it survives route navigations.
 * JournalComposer "claims" the editor on mount and "releases" it on unmount.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  QuillRichEditor,
  type QuillRichEditorRef,
} from "../components/QuillRichEditor";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import type { VoiceRecordButtonResult } from "../components/VoiceRecordButton";

/**
 * Generate theme-dependent CSS for the WebView editor.
 * Called when the theme changes to update the persistent WebView's styles.
 */
function generateThemeCSS(theme: {
  gradient: { middle: string };
  textPrimary: string;
  textSecondary: string;
  isDark: boolean;
}) {
  const checkColor = theme.isDark ? "%230f172a" : "%23ffffff";
  return `
    body { background-color: ${theme.gradient.middle}; }
    .ql-container { background-color: ${theme.gradient.middle}; }
    .ql-editor {
      color: ${theme.textPrimary};
      background-color: ${theme.gradient.middle};
    }
    .ql-editor.ql-blank::before { color: ${theme.textSecondary} !important; }
    .ql-editor h1, .ql-editor h2, .ql-editor h3 { color: ${theme.textPrimary}; }
    .ql-editor ul > li::marker, .ql-editor ol > li::marker { color: ${theme.textPrimary}; }
    .ql-editor ul[data-checked=false] > li { color: ${theme.textPrimary}; }
    .ql-editor ul[data-checked=true] > li { color: ${theme.textSecondary}; }
    .ql-editor ul[data-checked=false] > li::before {
      border: 2px solid ${theme.textSecondary} !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    .ql-editor ul[data-checked=true] > li::before {
      border: 2px solid ${theme.textPrimary} !important;
      background-color: ${theme.textPrimary} !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${checkColor}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E") !important;
    }
    .ql-editor blockquote { border-left-color: ${theme.textSecondary}; color: ${theme.textSecondary}; }
    .ql-editor pre { background-color: ${theme.isDark ? "#1e1e1e" : "#f5f5f5"}; }
    .audio-attachment { background: ${theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}; }
    .audio-delete-btn { background: ${theme.isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}; color: ${theme.textPrimary}; }
    .audio-play-btn { background: ${theme.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)"}; color: ${theme.textPrimary}; }
    .audio-progress { background: ${theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}; }
    .audio-progress-bar { background: ${theme.textPrimary}; }
    .audio-duration { color: ${theme.textSecondary}; }
  `;
}

// Only use persistent editor on native (mobile). Web creates editors cheaply.
const isNative = Platform.OS === "ios" || Platform.OS === "android";

interface ClaimOptions {
  initialHtml: string;
  autoFocus: boolean;
  onChangeHtml: (html: string) => void;
  onTranscriptionComplete: (result: VoiceRecordButtonResult) => void;
  onNoModelAvailable: () => void;
}

interface PersistentEditorContextValue {
  editorRef: React.RefObject<QuillRichEditorRef | null>;
  claim: (options: ClaimOptions) => void;
  release: () => void;
  isClaimed: boolean;
  isAvailable: boolean;
}

const PersistentEditorContext = createContext<PersistentEditorContextValue>({
  editorRef: { current: null },
  claim: () => {},
  release: () => {},
  isClaimed: false,
  isAvailable: false,
});

export function usePersistentEditor() {
  return useContext(PersistentEditorContext);
}

interface Callbacks {
  onChangeHtml: ((html: string) => void) | null;
  onTranscriptionComplete: ((result: VoiceRecordButtonResult) => void) | null;
  onNoModelAvailable: (() => void) | null;
}

export function PersistentEditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const editorRef = useRef<QuillRichEditorRef | null>(null);
  const [isClaimed, setIsClaimed] = useState(false);
  const callbacksRef = useRef<Callbacks>({
    onChangeHtml: null,
    onTranscriptionComplete: null,
    onNoModelAvailable: null,
  });
  const claimGenRef = useRef(0);
  const isReadyRef = useRef(false);
  const pendingClaimRef = useRef<{
    gen: number;
    initialHtml: string;
    autoFocus: boolean;
  } | null>(null);

  // Update WebView CSS when theme changes (dark/light mode)
  const seasonalTheme = useSeasonalTheme();
  useEffect(() => {
    if (!isReadyRef.current) return;
    editorRef.current?.updateThemeCSS(generateThemeCSS(seasonalTheme));
  }, [seasonalTheme]);

  const applyContent = useCallback(
    (html: string, autoFocus: boolean, gen: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setHtml(html).then(() => {
        if (autoFocus && claimGenRef.current === gen) {
          editor.focus();
        }
      });
    },
    [],
  );

  const seasonalThemeRef = useRef(seasonalTheme);
  seasonalThemeRef.current = seasonalTheme;

  const handleEditorReady = useCallback(() => {
    isReadyRef.current = true;
    if (__DEV__) console.log("[PersistentEditor] WebView ready");
    // Apply current theme CSS immediately
    editorRef.current?.updateThemeCSS(
      generateThemeCSS(seasonalThemeRef.current),
    );
    const pending = pendingClaimRef.current;
    if (pending && claimGenRef.current === pending.gen) {
      if (__DEV__) console.log("[PersistentEditor] Applying pending claim");
      pendingClaimRef.current = null;
      applyContent(pending.initialHtml, pending.autoFocus, pending.gen);
    }
  }, [applyContent]);

  const claim = useCallback(
    (options: ClaimOptions) => {
      const gen = ++claimGenRef.current;

      callbacksRef.current = {
        onChangeHtml: (html: string) => {
          if (claimGenRef.current !== gen) return;
          options.onChangeHtml(html);
        },
        onTranscriptionComplete: (result: VoiceRecordButtonResult) => {
          if (claimGenRef.current !== gen) return;
          options.onTranscriptionComplete(result);
        },
        onNoModelAvailable: () => {
          if (claimGenRef.current !== gen) return;
          options.onNoModelAvailable();
        },
      };

      setIsClaimed(true);

      if (isReadyRef.current) {
        applyContent(options.initialHtml, options.autoFocus, gen);
      } else {
        if (__DEV__)
          console.log("[PersistentEditor] Claim queued (WebView not ready)");
        pendingClaimRef.current = {
          gen,
          initialHtml: options.initialHtml,
          autoFocus: options.autoFocus,
        };
      }
    },
    [applyContent],
  );

  const release = useCallback(() => {
    claimGenRef.current++;
    pendingClaimRef.current = null;
    callbacksRef.current = {
      onChangeHtml: null,
      onTranscriptionComplete: null,
      onNoModelAvailable: null,
    };
    setIsClaimed(false);
  }, []);

  // Stable callbacks that route through the ref
  const handleChangeHtml = useCallback((html: string) => {
    callbacksRef.current.onChangeHtml?.(html);
  }, []);

  const handleTranscriptionComplete = useCallback(
    (result: VoiceRecordButtonResult) => {
      callbacksRef.current.onTranscriptionComplete?.(result);
    },
    [],
  );

  const handleNoModelAvailable = useCallback(() => {
    callbacksRef.current.onNoModelAvailable?.();
  }, []);

  const contextValue = useMemo<PersistentEditorContextValue>(
    () => ({
      editorRef,
      claim,
      release,
      isClaimed,
      isAvailable: isNative,
    }),
    [claim, release, isClaimed],
  );

  // Memoize the editor element so it doesn't re-render when the provider
  // re-renders (e.g. from isClaimed changes or parent layout re-renders).
  // All callback props are stable useCallbacks, so this is safe.
  const persistentEditorElement = useMemo(
    () =>
      isNative ? (
        <QuillRichEditor
          ref={editorRef}
          initialHtml="<p></p>"
          placeholder="Start writing..."
          onChangeHtml={handleChangeHtml}
          editorPadding={spacingPatterns.screen}
          onTranscriptionComplete={handleTranscriptionComplete}
          onNoModelAvailable={handleNoModelAvailable}
          onEditorReady={handleEditorReady}
        />
      ) : null,
    [
      handleChangeHtml,
      handleTranscriptionComplete,
      handleNoModelAvailable,
      handleEditorReady,
    ],
  );

  return (
    <PersistentEditorContext.Provider value={contextValue}>
      <View style={styles.wrapper}>
        {children}
        {/* The persistent editor — always mounted at the layout level so it
            survives Expo Router navigations. Absolutely positioned to fill
            the wrapper. Hidden when not claimed. */}
        {persistentEditorElement && (
          <View
            style={[styles.editorOverlay, !isClaimed && styles.hidden]}
            pointerEvents={isClaimed ? "auto" : "none"}
          >
            {persistentEditorElement}
          </View>
        )}
      </View>
    </PersistentEditorContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  editorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  hidden: {
    opacity: 0,
    // Move off-screen so WebView still loads but doesn't block touches
    position: "absolute",
    top: -9999,
    left: 0,
    right: 0,
    height: 1,
  },
});
