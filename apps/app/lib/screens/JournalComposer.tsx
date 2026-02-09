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
import { saveAttachment, getAudioAttachmentUrl } from "../attachments";
import {
  FloatingComposerHeader,
  ModelManagementModal,
  QuillRichEditor,
} from "../components";
import { useAttachmentsRepository } from "../db/attachmentsRepository";
import { useEntry, useUpdateEntry } from "../db/useEntries";
import { useSyncEngine } from "../sync";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { debounce } from "../utils/debounce";
import {
  convertBlockToHtml,
  convertEnrichedHtmlToQuill,
  getAttachmentsNeedingHydration,
  hydrateAttachments,
  isHtmlContentEmpty,
  stripBase64FromAttachments,
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

  // Sync on open - connect to server and sync entry when opened
  const { syncOnOpen, disconnectOnClose, onEntryUpdated } = useSyncEngine();

  // Stabilize sync callback with ref
  const onEntryUpdatedRef = useRef(onEntryUpdated);
  onEntryUpdatedRef.current = onEntryUpdated;

  useEffect(() => {
    if (entryId) {
      // Non-blocking sync - errors logged but don't block editing
      syncOnOpen(entryId).catch((err) =>
        console.warn("[JournalComposer] Sync on open failed:", err),
      );

      return () => {
        disconnectOnClose(entryId).catch((err) =>
          console.warn("[JournalComposer] Disconnect failed:", err),
        );
      };
    }
  }, [entryId, syncOnOpen, disconnectOnClose]);

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
  const lastEditTimeRef = useRef<number>(0); // Track when user last made an edit
  const htmlContentRef = useRef(""); // Track content for saving without causing re-renders
  const [contentVersion, setContentVersion] = useState(0); // Tracks content "version" for editor key

  // Derive base content from entry (before hydration)
  const baseContent = useMemo(() => {
    if (!entry) {
      console.log("[JournalComposer] baseContent: entry is null/undefined");
      return "<p></p>";
    }
    console.log(
      "[JournalComposer] baseContent: entry loaded, blocks:",
      entry.blocks.length,
    );

    // Look for html block first (new format)
    const htmlBlock = entry.blocks.find((b) => b.type === "html");
    if (htmlBlock) {
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
        return convertEnrichedHtmlToQuill(content);
      }

      // Otherwise, convert markdown block to HTML
      const htmlBlockConverted = convertBlockToHtml(markdownBlock);
      return (
        ("content" in htmlBlockConverted ? htmlBlockConverted.content : null) ||
        "<p></p>"
      );
    }

    // Empty or no content
    return "<p></p>";
  }, [entry]);

  // Hydrated content state - includes audio/image data URIs loaded from encrypted storage
  // null means hydration is in progress, string means ready to render
  const [initialContent, setInitialContent] = useState<string | null>(null);

  // Hydrate attachments when entry loads - decrypt files to cache and get file:// URLs
  useEffect(() => {
    let cancelled = false;

    async function hydrateContent() {
      const attachments = getAttachmentsNeedingHydration(baseContent);

      if (attachments.length === 0) {
        if (!cancelled) {
          console.log(
            "[JournalComposer] Hydration complete (no attachments), content length:",
            baseContent.length,
          );
          lastLoadTimeRef.current = Date.now();
          setInitialContent((prev) => {
            // If we're going from empty to non-empty content, increment version
            // to force editor remount with actual content
            const wasEmpty = !prev || prev === "<p></p>" || prev.length < 10;
            const isNowNonEmpty = baseContent.length >= 10;
            if (wasEmpty && isNowNonEmpty) {
              console.log(
                "[JournalComposer] Content upgraded from empty to real, incrementing version",
              );
              setContentVersion((v) => v + 1);
            }
            return baseContent;
          });
        }
        return;
      }

      // Get file:// URLs for each attachment (this decrypts them to cache)
      const urls = new Map<string, string>();

      for (const attachment of attachments) {
        if (cancelled) return;
        try {
          const url = await getAudioAttachmentUrl(entryId, attachment.id);
          urls.set(attachment.id, url);
        } catch (error) {
          console.warn(`Failed to prepare attachment ${attachment.id}:`, error);
        }
      }

      if (cancelled) return;

      // Hydrate the HTML with file:// URLs
      const hydrated = hydrateAttachments(baseContent, urls);

      console.log(
        "[JournalComposer] Hydration complete (with attachments), content length:",
        hydrated.length,
      );
      lastLoadTimeRef.current = Date.now();
      setInitialContent((prev) => {
        // If we're going from empty to non-empty content, increment version
        const wasEmpty = !prev || prev === "<p></p>" || prev.length < 10;
        const isNowNonEmpty = hydrated.length >= 10;
        if (wasEmpty && isNowNonEmpty) {
          console.log(
            "[JournalComposer] Content upgraded from empty to real, incrementing version",
          );
          setContentVersion((v) => v + 1);
        }
        return hydrated;
      });
    }

    // Reset content while hydrating
    console.log(
      "[JournalComposer] Hydration starting, baseContent length:",
      baseContent.length,
    );
    setInitialContent(null);
    hydrateContent();

    return () => {
      cancelled = true;
    };
  }, [baseContent, entryId]);

  // Determine if content is empty (for autoFocus and toolbar visibility)
  const isContentEmpty = useMemo(() => {
    return initialContent === null || isHtmlContentEmpty(initialContent);
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
      get onEntryUpdated() {
        return onEntryUpdatedRef.current;
      },
    }),
    [], // Now stable!
  );

  // Create debounced save function that calls journalActions
  const debouncedSave = useMemo(
    () =>
      debounce(async (htmlToSave: string) => {
        if (isDeletingRef.current || !entryId || !htmlToSave.trim()) return;

        // Strip base64 data from attachments before saving
        // The actual audio/image data lives in encrypted files, not in the HTML
        const sanitizedHtml = stripBase64FromAttachments(htmlToSave);

        try {
          await saveJournalContent(entryId, sanitizedHtml, "", actionContext);

          // Sync attachments - diff HTML against database and cleanup orphans
          await attachmentsRepoRef.current.syncForEntry(entryId, sanitizedHtml);
        } catch (error) {
          console.error("Error saving:", error);
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

  // Track initial content hash to detect sync updates
  const lastAppliedContentRef = useRef<string | null>(null);

  // Handle sync updates - when content changes from sync, update the editor
  // This runs when initialContent changes (e.g., from sync pulling new data)
  useEffect(() => {
    if (!initialContent || !editorRef.current) return;

    // On first load, just record the content hash
    if (lastAppliedContentRef.current === null) {
      lastAppliedContentRef.current = initialContent;
      return;
    }

    // If content is same as what we last applied, nothing to do
    if (initialContent === lastAppliedContentRef.current) {
      return;
    }

    // Content changed from sync - check if we should apply it
    // Only apply if the user hasn't edited recently (avoid overwriting their work)
    const timeSinceLastEdit = Date.now() - lastEditTimeRef.current;
    const userIsIdle =
      lastEditTimeRef.current === 0 || timeSinceLastEdit > 2000; // Never edited or 2+ seconds since last edit

    if (userIsIdle) {
      console.log("[JournalComposer] Applying sync update to editor");
      editorRef.current.setHtml(initialContent).catch((err) => {
        console.warn("[JournalComposer] Failed to apply sync update:", err);
      });
      lastAppliedContentRef.current = initialContent;
      // Update the ref so we don't re-save the sync'd content
      htmlContentRef.current = initialContent;
      // Reset load time to prevent re-saving the sync'd content as an edit
      lastLoadTimeRef.current = Date.now();
    } else {
      console.log(
        "[JournalComposer] Skipping sync update - user is actively editing (last edit:",
        timeSinceLastEdit,
        "ms ago)",
      );
      // TODO: Could show a notification here that new changes are available
    }
  }, [initialContent]);

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
      // Strip base64 data from attachments before saving
      const sanitizedContent = stripBase64FromAttachments(currentContent);

      try {
        // Use updateCache: true since we're navigating away - this ensures
        // the entry list shows the updated content immediately without
        // waiting for an async refetch (fixes stale data on back navigation)
        await saveJournalContent(entryId, sanitizedContent, "", actionContext, {
          updateCache: true,
        });

        // Sync attachments on back press too
        await attachmentsRepoRef.current.syncForEntry(
          entryId,
          sanitizedContent,
        );
      } catch (error) {
        console.error("Error saving on back:", error);
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

      // Track when user actually edited (for sync idle detection)
      lastEditTimeRef.current = Date.now();

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

          // Get file:// URL for the audio (this decrypts it to cache)
          const audioUrl = await getAudioAttachmentUrl(entryId, attachment.id);

          // Insert audio attachment using custom Quill blot
          await editorRef.current.insertAudioAttachment({
            id: attachment.id,
            src: audioUrl,
            duration: result.duration,
          });

          // Clean up the temp file
          await FileSystem.deleteAsync(result.audioUri, { idempotent: true });
        } catch (err) {
          console.error("Failed to save audio:", err);
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
        {entry && initialContent !== null && (
          <QuillRichEditor
            key={`editor-${entryId}-${seasonalTheme.isDark ? "dark" : "light"}-v${contentVersion}`}
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
