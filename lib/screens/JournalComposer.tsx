import React, { useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useEntry, useUpdateEntry } from "../db/useEntries";
import { debounce } from "../utils/debounce";
import { FloatingComposerHeader, QuillRichEditor } from "../components";
import type { QuillRichEditorRef } from "../components";
import { saveJournalContent } from "./journalActions";
import { useTrackScreenView } from "../analytics";
import { convertBlockToHtml, convertEnrichedHtmlToQuill, isHtmlContentEmpty } from "../utils/htmlUtils";

export interface JournalComposerProps {
  entryId: number;
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
}

export function JournalComposer({
  entryId,
  onSave,
  onCancel,
}: JournalComposerProps) {
  const seasonalTheme = useSeasonalTheme();

  // Track screen view
  useTrackScreenView("Journal Composer");
  const insets = useSafeAreaInsets();

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

  const editorRef = useRef<QuillRichEditorRef>(null);
  const isDeletingRef = useRef(false); // Track deletion state to prevent race conditions
  const lastLoadTimeRef = useRef<number>(0); // Track when we last loaded content
  const htmlContentRef = useRef(""); // Track content for saving without causing re-renders

  // Derive initial content from entry (single source of truth)
  // Convert markdown blocks to HTML on load, and convert old enriched format to Quill format
  const initialContent = useMemo(() => {
    if (!entry) return "<p></p>";

    // Look for html block first (new format)
    const htmlBlock = entry.blocks.find((b) => b.type === "html");
    if (htmlBlock) {
      lastLoadTimeRef.current = Date.now();
      // Still convert in case it was saved with old format checklists
      const converted = convertEnrichedHtmlToQuill(htmlBlock.content) || "<p></p>";
      // Debug: Log loaded content to catch unexpected changes
      if (htmlBlock.content.includes('data-checked="true"')) {
        console.log('[JournalComposer] Loading HTML from DB:', htmlBlock.content);
        console.log('[JournalComposer] After conversion:', converted);
      }
      return converted;
    }

    // Fall back to markdown block (legacy format) and convert to HTML
    const markdownBlock = entry.blocks.find((b) => b.type === "markdown");
    if (markdownBlock && markdownBlock.content) {
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

      // If it already has HTML tags, convert old enriched format to Quill format
      if (content.includes("<")) {
        lastLoadTimeRef.current = Date.now();
        return convertEnrichedHtmlToQuill(content);
      }

      // Otherwise, convert markdown block to HTML
      const htmlBlockConverted = convertBlockToHtml(markdownBlock);
      lastLoadTimeRef.current = Date.now();
      return ("content" in htmlBlockConverted ? htmlBlockConverted.content : null) || "<p></p>";
    }

    // Empty or no content
    return "<p></p>";
  }, [entry]);

  // Determine if content is empty (for autoFocus and toolbar visibility)
  const isContentEmpty = useMemo(() => {
    return isHtmlContentEmpty(initialContent);
  }, [initialContent]);

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
          await saveJournalContent(entryId, htmlToSave, "", actionContext);
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

  const handleBeforeDelete = useCallback(() => {
    // Mark as deleting to prevent save operations
    isDeletingRef.current = true;

    // Cancel any pending debounced saves
    (debouncedSave as any).cancel();
  }, [debouncedSave]);

  // Handle back button - save before navigating to keep state consistent
  const handleBackPress = useCallback(async () => {
    // Cancel any pending debounced saves
    (debouncedSave as any).cancel();

    // Save content and wait for it to complete before navigating
    const currentContent = htmlContentRef.current;
    if (currentContent.trim() && !isDeletingRef.current) {
      try {
        await saveJournalContent(entryId, currentContent, "", actionContext);
      } catch (error) {
        console.error("[JournalComposer] Error saving on back:", error);
      }
    }

    // Navigate after save completes
    onCancelRef.current?.();
  }, [entryId, actionContext, debouncedSave]);

  // Handle content changes from editor
  const handleChangeHtml = useCallback(
    (newHtml: string) => {
      // Detect if this is the editor's internal normalization right after loading
      const timeSinceLoad = Date.now() - lastLoadTimeRef.current;
      if (timeSinceLoad < 250) {
        htmlContentRef.current = newHtml;
        return; // Don't trigger save for editor normalization
      }

      // Store in ref instead of state to avoid re-renders
      htmlContentRef.current = newHtml;
      // Event-based auto-save: directly call debounced function
      debouncedSave(newHtml);
    },
    [debouncedSave]
  );

  // Show UI shell immediately - content loads progressively
  // Note: Not using KeyboardAvoidingView - QuillRichEditor handles keyboard positioning
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      {/* Floating Header Buttons */}
      <FloatingComposerHeader
        entryId={entryId}
        onBack={handleBackPress}
        onBeforeDelete={handleBeforeDelete}
        disabled={updateEntryMutation.isPending}
      />

      {/* Quill Rich Editor */}
      <View
        style={[
          styles.editorContainer,
          {
            paddingTop: insets.top,
          },
        ]}
      >
        {entry && (
          <QuillRichEditor
            key={`editor-${entryId}`}
            ref={editorRef}
            initialHtml={initialContent}
            placeholder="Start writing..."
            onChangeHtml={handleChangeHtml}
            autoFocus={isContentEmpty}
            editorPadding={spacingPatterns.screen}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
  },
});
