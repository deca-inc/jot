import * as FileSystem from "expo-file-system/legacy";
import React, {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackScreenView } from "../analytics";
import { saveAttachment, getAttachmentDataUri } from "../attachments";
import {
  FloatingComposerHeader,
  ModelManagementModal,
  QuillRichEditor,
} from "../components";
import { useAttachmentsRepository } from "../db/attachmentsRepository";
import { useEntry, useUpdateEntry } from "../db/useEntries";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { debounce } from "../utils/debounce";
import {
  convertBlockToHtml,
  convertEnrichedHtmlToQuill,
  isHtmlContentEmpty,
} from "../utils/htmlUtils";
import { saveJournalContent } from "./journalActions";
import type { QuillRichEditorRef } from "../components";

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

  // Model management modal state
  const [showModelModal, setShowModelModal] = useState(false);

  // Use react-query hooks
  const { data: entry, isLoading: _isLoadingEntry } = useEntry(entryId);
  const updateEntryMutation = useUpdateEntry();

  // Attachments repository for tracking attachment metadata
  const attachmentsRepo = useAttachmentsRepository();

  // Stabilize mutation and callbacks with refs
  const updateEntryMutationRef = useRef(updateEntryMutation);
  updateEntryMutationRef.current = updateEntryMutation;

  const attachmentsRepoRef = useRef(attachmentsRepo);
  attachmentsRepoRef.current = attachmentsRepo;

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
      return convertEnrichedHtmlToQuill(htmlBlock.content) || "<p></p>";
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
      return (
        ("content" in htmlBlockConverted ? htmlBlockConverted.content : null) ||
        "<p></p>"
      );
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
      get onSave() {
        return onSaveRef.current;
      },
    }),
    [], // Now stable!
  );

  // Create debounced save function that calls journalActions
  const debouncedSave = useMemo(
    () =>
      debounce(async (htmlToSave: string) => {
        if (isDeletingRef.current || !entryId || !htmlToSave.trim()) return;

        try {
          await saveJournalContent(entryId, htmlToSave, "", actionContext);

          // Sync attachments - diff HTML against database and cleanup orphans
          const { deleted } = await attachmentsRepoRef.current.syncForEntry(
            entryId,
            htmlToSave,
          );
          if (deleted.length > 0) {
            console.log(
              `[JournalComposer] Cleaned up ${deleted.length} orphaned attachments`,
            );
          }
        } catch (error) {
          console.error("[JournalComposer] Error saving:", error);
        }
      }, 1000),
    [entryId, actionContext],
  );

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  const handleBeforeDelete = useCallback(() => {
    // Mark as deleting to prevent save operations
    isDeletingRef.current = true;

    // Cancel any pending debounced saves
    debouncedSave.cancel();
  }, [debouncedSave]);

  // Handle back button - save before navigating to keep state consistent
  const handleBackPress = useCallback(async () => {
    // Cancel any pending debounced saves
    debouncedSave.cancel();

    // Save content and wait for it to complete before navigating
    const currentContent = htmlContentRef.current;
    if (currentContent.trim() && !isDeletingRef.current) {
      try {
        // Use updateCache: true since we're navigating away - this ensures
        // the entry list shows the updated content immediately without
        // waiting for an async refetch (fixes stale data on back navigation)
        await saveJournalContent(entryId, currentContent, "", actionContext, {
          updateCache: true,
        });

        // Sync attachments on back press too
        await attachmentsRepoRef.current.syncForEntry(entryId, currentContent);
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
    [debouncedSave],
  );

  // Handle voice transcription completion - insert audio + text into editor
  const handleTranscriptionComplete = useCallback(
    async (result: {
      text: string;
      audioUri: string | null;
      duration: number;
    }) => {
      if (!editorRef.current) return;

      // Save audio as encrypted attachment and insert audio player
      if (result.audioUri) {
        try {
          // Save to encrypted attachment storage
          const attachment = await saveAttachment(
            result.audioUri,
            entryId,
            "audio",
            "audio/wav",
            undefined,
            result.duration,
          );

          // Insert attachment record into database for tracking
          await attachmentsRepoRef.current.insert({
            id: attachment.id,
            entryId,
            type: "audio",
            mimeType: "audio/wav",
            filename: attachment.filename,
            size: attachment.size,
            duration: attachment.duration,
          });

          // Get the audio as a base64 data URI
          const dataUri = await getAttachmentDataUri(
            entryId,
            attachment.id,
            "audio/wav",
          );

          // Insert audio attachment using custom Quill blot
          await editorRef.current.insertAudioAttachment({
            id: attachment.id,
            src: dataUri,
            duration: result.duration,
          });

          // Clean up the temp file
          await FileSystem.deleteAsync(result.audioUri, { idempotent: true });

          // Format duration for logging
          const mins = Math.floor(result.duration / 60);
          const secs = Math.floor(result.duration % 60);
          const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;
          console.log(
            `[JournalComposer] Saved audio attachment: ${attachment.id} (${durationStr})`,
          );
        } catch (err) {
          console.error("[JournalComposer] Failed to save audio:", err);
        }
      }

      // Insert transcription text after the audio
      if (result.text.trim()) {
        editorRef.current?.insertHtml(`<p>${result.text}</p>`);
      }
    },
    [entryId],
  );

  // Handle no voice model available - open model modal to voice tab
  const handleNoModelAvailable = useCallback(() => {
    setShowModelModal(true);
  }, []);

  // Show UI shell immediately - content loads progressively
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
            key={`editor-${entryId}-${seasonalTheme.isDark ? "dark" : "light"}`}
            ref={editorRef}
            initialHtml={initialContent}
            placeholder="Start writing..."
            onChangeHtml={handleChangeHtml}
            autoFocus={isContentEmpty}
            editorPadding={spacingPatterns.screen}
            onTranscriptionComplete={handleTranscriptionComplete}
            onNoModelAvailable={handleNoModelAvailable}
          />
        )}
      </View>

      {/* Model Management Modal */}
      <ModelManagementModal
        visible={showModelModal}
        onClose={() => setShowModelModal(false)}
        initialTab="voice"
      />
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
