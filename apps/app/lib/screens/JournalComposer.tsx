import { useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import { View, StyleSheet, TextInput } from "react-native";
import { useTrackScreenView } from "../analytics";
import { saveAttachment, getAudioAttachmentUrl } from "../attachments";
import {
  FloatingComposerHeader,
  ModelManagementModal,
  QuillRichEditor,
} from "../components";
import { useAttachmentsRepository } from "../db/attachmentsRepository";
import { useEntryRepository } from "../db/entries";
import { useEntry, useUpdateEntry, entryKeys } from "../db/useEntries";
import { usePersistentEditor } from "../editor/PersistentEditorContext";
import { useStableInsets } from "../hooks/useStableInsets";
import { useModelInfo } from "../navigation/ModelInfoContext";
import { useSyncAuth, useSyncEngine } from "../sync";
import {
  downloadAttachmentFromServer,
  uploadAttachmentForSync,
} from "../sync/assetSyncService";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { debounce } from "../utils/debounce";
import {
  resetEditorTrace,
  getEditorTrace,
  type EditorTrace,
} from "../utils/editorPerf";
import {
  convertBlockToHtml,
  convertEnrichedHtmlToQuill,
  extractTitleFromHtml,
  getAttachmentsNeedingHydration,
  hydrateAttachments,
  isHtmlContentEmpty,
  stripBase64FromAttachments,
} from "../utils/htmlUtils";
import { requestSave } from "../utils/request-save";
import { saveJournalContent } from "./journalActions";
import type { QuillRichEditorRef } from "../components";

/**
 * Hydrate HTML content by decrypting attachments and replacing IDs with file:// URLs.
 * Tries local storage first, falls back to downloading from sync server.
 */
async function hydrateHtmlContent(
  html: string,
  entryId: number | undefined,
  entryUuid: string | null | undefined,
  serverUrl: string | null,
): Promise<string> {
  const attachments = getAttachmentsNeedingHydration(html);
  if (attachments.length === 0 || !entryId) return html;

  const urls = new Map<string, string>();
  for (const attachment of attachments) {
    try {
      const url = await getAudioAttachmentUrl(entryId, attachment.id);
      urls.set(attachment.id, url);
    } catch (error) {
      if (entryUuid && serverUrl) {
        try {
          const downloaded = await downloadAttachmentFromServer(
            serverUrl,
            entryId,
            entryUuid,
            attachment.id,
          );
          if (downloaded) {
            const url = await getAudioAttachmentUrl(entryId, attachment.id);
            urls.set(attachment.id, url);
          }
        } catch (downloadError) {
          console.warn(
            `Failed to download attachment ${attachment.id}:`,
            downloadError,
          );
        }
      } else {
        console.warn(`Failed to prepare attachment ${attachment.id}:`, error);
      }
    }
  }

  return hydrateAttachments(html, urls);
}

export interface JournalComposerProps {
  entryId?: number;
  /** Initial text content for new entries (before DB entry exists) */
  initialContent?: string;
  /** Parent entry ID for check-ins */
  parentId?: number;
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  /** Called when a new entry is created in the database (on first edit) */
  onCreated?: (entryId: number) => void;
  /** Hide the back button (e.g., in sidebar layout) */
  hideBackButton?: boolean;
}

export function JournalComposer({
  entryId: entryIdProp,
  initialContent: initialContentProp = "",
  parentId,
  onSave,
  onCancel,
  onCreated,
  hideBackButton = false,
}: JournalComposerProps) {
  const seasonalTheme = useSeasonalTheme();

  // Start performance trace on mount (once only, dev only)
  const perfTraceRef = useRef<EditorTrace | null>(null);
  if (!perfTraceRef.current && __DEV__) {
    perfTraceRef.current = resetEditorTrace();
    perfTraceRef.current?.mark("composer-mounted");
  }

  // Track screen view
  useTrackScreenView("Journal Composer");
  const insets = useStableInsets();

  // Model management modal state
  const [showModelModal, setShowModelModal] = useState(false);

  // Lazy entry creation: entryId may be undefined for new notes (created on first edit)
  const [entryId, setEntryId] = useState(entryIdProp);
  const entryRepository = useEntryRepository();
  const queryClient = useQueryClient();
  const isCreatingRef = useRef(false);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  // Track whether this component started as a new entry (no entryIdProp).
  // Used to keep the editor stable when transitioning from new → saved.
  const wasCreatedAsNew = useRef(!entryIdProp);

  // Use react-query hooks
  const { data: entry, isLoading: isLoadingEntry } = useEntry(entryId);
  const updateEntryMutation = useUpdateEntry();

  // Track when entry data first arrives from React Query
  const entryFetchMarkedRef = useRef(false);
  if (!entryFetchMarkedRef.current) {
    if (!entryId) {
      entryFetchMarkedRef.current = true;
      perfTraceRef.current?.mark("entry-data-ready (new entry, no fetch)");
    } else if (isLoadingEntry) {
      perfTraceRef.current?.mark("entry-data-loading");
    } else if (entry) {
      entryFetchMarkedRef.current = true;
      perfTraceRef.current?.mark("entry-data-ready (fetched)");
    }
  }

  // Attachments repository for tracking attachment metadata
  const attachmentsRepo = useAttachmentsRepository();

  // Sync on open - connect to server and sync entry when opened
  const { syncOnOpen, disconnectOnClose, onEntryUpdated } = useSyncEngine();

  // Sync auth state - needed for server URL when downloading/uploading attachments
  const { state: syncAuthState } = useSyncAuth();
  const serverUrl = syncAuthState.settings?.serverUrl ?? null;

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

  // Use the persistent (always-mounted) editor on native, local ref on web
  const persistentEditor = usePersistentEditor();
  const localEditorRef = useRef<QuillRichEditorRef | null>(null);
  const editorRef = persistentEditor.isAvailable
    ? persistentEditor.editorRef
    : localEditorRef;

  const isDeletingRef = useRef(false); // Track deletion state to prevent race conditions
  const lastLoadTimeRef = useRef<number>(0); // Track when we last loaded content
  const lastEditTimeRef = useRef<number>(0); // Track when user last made an edit
  const htmlContentRef = useRef(""); // Track content for saving without causing re-renders
  const hasLoadedRef = useRef(false); // True after initial content load — prevents re-hydration on refetch

  // Derive base content from entry (before hydration)
  const baseContent = useMemo(() => {
    getEditorTrace()?.mark("baseContent-compute-start");
    if (!entry) {
      // New note: use initial content prop if provided
      if (initialContentProp.trim()) {
        return `<h1>${initialContentProp}</h1>`;
      }
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
  }, [entry, initialContentProp]);
  getEditorTrace()?.mark("baseContent-computed");

  // Hydrated content state - includes audio/image data URIs loaded from encrypted storage
  // null means hydration is in progress, string means ready to render
  const [initialContent, setInitialContent] = useState<string | null>(null);

  // Track previous baseContent to detect remote sync changes after initial load
  const prevBaseContentRef = useRef(baseContent);

  // Hydrate attachments on initial load — runs once per mount.
  // After hasLoadedRef is set, subsequent baseContent changes (from React Query
  // refetches) are handled by the sync update effect below instead.
  useEffect(() => {
    if (hasLoadedRef.current) return;

    let cancelled = false;

    (async () => {
      getEditorTrace()?.mark("hydration-start");
      const hydrated = await hydrateHtmlContent(
        baseContent,
        entryId,
        entry?.uuid,
        serverUrl,
      );
      getEditorTrace()?.mark("hydration-end");

      if (!cancelled) {
        hasLoadedRef.current = true;
        prevBaseContentRef.current = baseContent;
        lastLoadTimeRef.current = Date.now();
        getEditorTrace()?.mark("setInitialContent");
        setInitialContent(hydrated);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseContent, entryId, entry?.uuid, serverUrl]);

  // Determine if content is empty (for autoFocus and toolbar visibility)
  const isContentEmpty = useMemo(() => {
    return initialContent === null || isHtmlContentEmpty(initialContent);
  }, [initialContent]);

  // Claim the persistent editor when content is ready (native only).
  // On web, the editor is rendered inline in JSX below.
  const handleChangeHtmlRef = useRef<(html: string) => void>(() => {});
  const handleTranscriptionCompleteRef = useRef<
    (result: {
      text: string;
      audioUri: string | null;
      duration: number;
    }) => void
  >(() => {});
  const handleNoModelAvailableRef = useRef<() => void>(() => {});

  // Stable refs so the effect doesn't re-run when the context object changes
  const claimRef = useRef(persistentEditor.claim);
  claimRef.current = persistentEditor.claim;
  const releaseRef = useRef(persistentEditor.release);
  releaseRef.current = persistentEditor.release;
  const isAvailable = persistentEditor.isAvailable;

  useEffect(() => {
    if (!isAvailable || initialContent === null) return;

    getEditorTrace()?.mark("persistent-editor-claim");
    lastLoadTimeRef.current = Date.now();

    claimRef.current({
      initialHtml: initialContent,
      autoFocus: isHtmlContentEmpty(initialContent),
      onChangeHtml: (html: string) => handleChangeHtmlRef.current(html),
      onTranscriptionComplete: (result) =>
        handleTranscriptionCompleteRef.current(result),
      onNoModelAvailable: () => handleNoModelAvailableRef.current(),
    });

    return () => {
      releaseRef.current();
    };
  }, [initialContent, isAvailable]);

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

  // Track whether the user has pinned a custom title (via ref so debounce sees latest)
  const titlePinnedRef = useRef(entry?.titlePinned ?? false);
  titlePinnedRef.current = entry?.titlePinned ?? false;

  // Title state: shows auto-derived title as placeholder, user can edit to pin
  const [titleValue, setTitleValue] = useState("");
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  // Derive the placeholder title from entry or content
  const titlePlaceholder = useMemo(() => {
    if (entry?.titlePinned && entry.title && entry.title !== "Untitled") {
      return entry.title;
    }
    // Derive from content when available
    if (htmlContentRef.current) {
      const derived = extractTitleFromHtml(htmlContentRef.current);
      if (derived !== "Untitled") return derived;
    }
    if (entry?.title && entry.title !== "Untitled") {
      return entry.title;
    }
    return "Untitled";
  }, [entry?.title, entry?.titlePinned]);

  // When entry loads with a pinned title, populate the input
  useEffect(() => {
    if (entry?.titlePinned && entry.title && entry.title !== "Untitled") {
      setTitleValue(entry.title);
    }
  }, [entry?.titlePinned, entry?.title]);

  // Handle title changes from the user — local state only, save deferred to blur
  const handleTitleChange = useCallback((text: string) => {
    setTitleValue(text);
    titlePinnedRef.current = true;
  }, []);

  // Handle title focus - clear the auto-derived text if not pinned
  const handleTitleFocus = useCallback(() => {
    setIsTitleFocused(true);
    // If not already pinned and showing auto-derived content, clear it so user starts fresh
    if (!titlePinnedRef.current) {
      setTitleValue("");
    }
  }, []);

  // Handle title blur — persist the title to DB
  const handleTitleBlur = useCallback(() => {
    setIsTitleFocused(false);
    if (!entryId) return;

    const trimmed = titleValue.trim();
    if (trimmed) {
      // User typed a custom title — save and pin
      updateEntryMutationRef.current.mutate(
        {
          id: entryId,
          input: { title: trimmed, titlePinned: true },
          skipCacheUpdate: true,
        },
        {
          onSuccess: () => {
            onEntryUpdatedRef
              .current?.(entryId, { title: trimmed })
              .catch((err) => {
                console.error("[JournalComposer] Error syncing title:", err);
              });
          },
        },
      );
    } else {
      // User left it empty — unpin so auto-derivation resumes
      titlePinnedRef.current = false;
      updateEntryMutationRef.current.mutate({
        id: entryId,
        input: { titlePinned: false },
        skipCacheUpdate: true,
      });
    }
  }, [titleValue, entryId]);

  // Create debounced save function that calls journalActions
  const debouncedSave = useMemo(
    () =>
      debounce(async (htmlToSave: string) => {
        if (isDeletingRef.current || !entryId || !htmlToSave.trim()) return;

        // Strip base64 data from attachments before saving
        // The actual audio/image data lives in encrypted files, not in the HTML
        const sanitizedHtml = stripBase64FromAttachments(htmlToSave);

        try {
          await saveJournalContent(entryId, sanitizedHtml, "", actionContext, {
            titlePinned: titlePinnedRef.current,
          });

          // Sync attachments - diff HTML against database and cleanup orphans
          await attachmentsRepoRef.current.syncForEntry(entryId, sanitizedHtml);
        } catch (error) {
          console.error("Error saving:", error);
        }
      }, 1000),
    [entryId, actionContext],
  );

  // On unmount or entry switch, cancel pending debounce and persist to DB.
  // IMPORTANT: Use a bare mutation (skipCacheUpdate, no sync notification).
  // Notifying sync from the unmount save causes an infinite loop:
  //   save → sync → invalidateQueries(detail) → refetch → re-render → save …
  useEffect(() => {
    return () => {
      debouncedSave.cancel();

      // Suppress sync notifications from any in-flight saves (e.g. a
      // debouncedSave whose timer fired before unmount but whose mutation
      // completes after).  Each component instance has its own ref, so
      // this doesn't affect a newly-mounted instance.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional teardown of ref
      onEntryUpdatedRef.current = (async () => {}) as any;

      const currentContent = htmlContentRef.current;
      if (entryId && currentContent.trim() && !isDeletingRef.current) {
        const sanitizedContent = stripBase64FromAttachments(currentContent);
        const title = titlePinnedRef.current
          ? undefined
          : extractTitleFromHtml(sanitizedContent);
        updateEntryMutationRef.current.mutate({
          id: entryId,
          input: {
            title,
            blocks: [{ type: "html" as const, content: sanitizedContent }],
          },
          skipCacheUpdate: true,
        });
      }
    };
  }, [debouncedSave, entryId]);

  // Register a save handler so external navigation (e.g. breadcrumb click)
  // can await a save before leaving the composer.
  useEffect(() => {
    return requestSave.register(async () => {
      debouncedSave.cancel();
      const currentContent = htmlContentRef.current;
      if (entryId && currentContent.trim() && !isDeletingRef.current) {
        const sanitizedContent = stripBase64FromAttachments(currentContent);
        await saveJournalContent(entryId, sanitizedContent, "", actionContext, {
          updateCache: true,
          titlePinned: titlePinnedRef.current,
        });
      }
    });
  }, [debouncedSave, entryId, actionContext]);

  // Apply remote sync updates to the editor after initial load.
  // When a remote change arrives, SyncInitializer invalidates the detail query,
  // useEntry refetches, and baseContent recalculates. This effect detects the
  // diff and pushes it to the editor via setHtml() — no remount needed.
  useEffect(() => {
    // Before initial load completes, just track baseContent for later comparison
    if (!hasLoadedRef.current) {
      prevBaseContentRef.current = baseContent;
      return;
    }

    // Skip if content hasn't changed (same DB data after refetch)
    if (baseContent === prevBaseContentRef.current) return;
    prevBaseContentRef.current = baseContent;

    // Content changed from remote sync — only apply if user is idle
    const timeSinceLastEdit = Date.now() - lastEditTimeRef.current;
    const userIsIdle =
      lastEditTimeRef.current === 0 || timeSinceLastEdit > 2000;

    if (!userIsIdle || !editorRef.current) return;

    let cancelled = false;

    (async () => {
      const hydrated = await hydrateHtmlContent(
        baseContent,
        entryId,
        entry?.uuid,
        serverUrl,
      );

      if (cancelled || !editorRef.current) return;

      // Re-check idle after async hydration (user may have started typing)
      const currentTimeSinceEdit = Date.now() - lastEditTimeRef.current;
      if (lastEditTimeRef.current > 0 && currentTimeSinceEdit <= 2000) return;

      console.log("[JournalComposer] Applying sync update to editor");
      editorRef.current.setHtml(hydrated).catch((err: unknown) => {
        console.warn("[JournalComposer] Failed to apply sync update:", err);
      });
      htmlContentRef.current = hydrated;
      lastLoadTimeRef.current = Date.now();
    })();

    return () => {
      cancelled = true;
    };
  }, [baseContent, entryId, entry?.uuid, serverUrl]);

  const [isDeleting, setIsDeleting] = useState(false);
  const handleBeforeDelete = useCallback(() => {
    // Mark as deleting to prevent save operations and unmount editor immediately
    isDeletingRef.current = true;
    setIsDeleting(true);

    // Cancel any pending debounced saves
    debouncedSave.cancel();

    // Disconnect sync so the Yjs observer stops firing callbacks
    if (entryId) {
      disconnectOnClose(entryId).catch(() => {});
    }
  }, [debouncedSave, entryId, disconnectOnClose]);

  // Handle back button - save before navigating to keep state consistent
  const handleBackPress = useCallback(async () => {
    // Cancel any pending debounced saves
    debouncedSave.cancel();

    // Save content and wait for it to complete before navigating
    const currentContent = htmlContentRef.current;
    if (entryId && currentContent.trim() && !isDeletingRef.current) {
      // Strip base64 data from attachments before saving
      const sanitizedContent = stripBase64FromAttachments(currentContent);

      try {
        // Use updateCache: true since we're navigating away - this ensures
        // the entry list shows the updated content immediately without
        // waiting for an async refetch (fixes stale data on back navigation)
        await saveJournalContent(entryId, sanitizedContent, "", actionContext, {
          updateCache: true,
          titlePinned: titlePinnedRef.current,
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

  // Create entry in DB (lazy creation). Called on first body edit or title edit.
  const createEntry = useCallback(
    async (opts: { html?: string; title?: string; titlePinned?: boolean }) => {
      if (entryId || isCreatingRef.current) return;
      isCreatingRef.current = true;

      try {
        const entry = await entryRepository.create({
          type: "journal",
          title: opts.title ?? (parentId ? "Check-in" : "Untitled"),
          titlePinned: opts.titlePinned,
          blocks: [{ type: "html" as const, content: opts.html ?? "<p></p>" }],
          tags: [],
          attachments: [],
          isFavorite: false,
          parentId,
        });
        setEntryId(entry.id);

        // Add to React Query caches so sidebar shows the new entry immediately
        queryClient.setQueryData(entryKeys.detail(entry.id), entry);
        if (!parentId) {
          queryClient.setQueriesData<
            | { pages: { entries: unknown[] }[]; pageParams: unknown[] }
            | undefined
          >({ queryKey: entryKeys.lists() }, (oldData) => {
            if (!oldData?.pages) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page, index: number) =>
                index === 0
                  ? { ...page, entries: [entry, ...page.entries] }
                  : page,
              ),
            };
          });
        }

        onCreatedRef.current?.(entry.id);
      } catch (error) {
        console.error("Error creating entry:", error);
        isCreatingRef.current = false;
      }
    },
    [entryId, entryRepository, parentId, queryClient],
  );

  // Expose entry creation to the layout header (for title-first creation).
  // Uses a ref so registering/unregistering doesn't cause re-renders.
  const { createComposerEntryRef } = useModelInfo();
  const createEntryRef = useRef(createEntry);
  createEntryRef.current = createEntry;

  useEffect(() => {
    const ref = createComposerEntryRef;
    ref.current = async (title: string) => {
      await createEntryRef.current({
        title,
        titlePinned: true,
      });
      // Sync local title state so the body title input shows the pinned title
      titlePinnedRef.current = true;
      setTitleValue(title);
    };
    return () => {
      ref.current = null;
    };
  }, [createComposerEntryRef]);

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

      // Lazy creation: if no entry yet, create it first
      if (!entryId) {
        createEntry({ html: newHtml });
        return;
      }

      // Event-based auto-save: directly call debounced function
      debouncedSave(newHtml);
    },
    [entryId, debouncedSave, createEntry],
  );

  // Handle voice transcription completion - insert audio + text into editor
  const handleTranscriptionComplete = useCallback(
    async (result: {
      text: string;
      audioUri: string | null;
      duration: number;
    }) => {
      if (!editorRef.current || !entryId) return;

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

          // Upload to sync server in background (non-blocking)
          if (entry?.uuid && serverUrl) {
            uploadAttachmentForSync(
              serverUrl,
              entryId,
              entry.uuid,
              attachment.id,
            ).catch((uploadErr) =>
              console.warn(
                "[JournalComposer] Background attachment upload failed:",
                uploadErr,
              ),
            );
          }
        } catch (err) {
          console.error("Failed to save audio:", err);
        }
      }

      // Insert transcription text after the audio (already HTML from formatTranscription)
      if (result.text.trim()) {
        editorRef.current?.insertHtml(result.text);
      }
    },
    [entryId],
  );

  // Handle no voice model available - open model modal to voice tab
  const handleNoModelAvailable = useCallback(() => {
    setShowModelModal(true);
  }, []);

  // Keep persistent editor callback refs in sync
  handleChangeHtmlRef.current = handleChangeHtml;
  handleTranscriptionCompleteRef.current = handleTranscriptionComplete;
  handleNoModelAvailableRef.current = handleNoModelAvailable;

  // Mark when render occurs with content ready
  if (initialContent !== null) {
    getEditorTrace()?.mark("render-with-content");
  }

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
        hideBackButton={hideBackButton}
      />

      {/* Title + Editor */}
      <View
        style={[
          styles.editorContainer,
          {
            // Ensure content clears the floating header (4px offset + 44px button + 8px gap)
            // When back button is hidden (desktop sidebar), no padding needed —
            // the fixed toolbar provides the top edge.
            paddingTop: hideBackButton
              ? 0
              : Math.max(
                  insets.top,
                  spacingPatterns.xxs + 44 + spacingPatterns.xs,
                ),
          },
        ]}
      >
        {/* Title Input — hidden on desktop where the layout header handles it */}
        {!hideBackButton && (
          <TextInput
            style={[
              styles.titleInput,
              { color: seasonalTheme.textPrimary },
              !titleValue &&
                !isTitleFocused && { color: seasonalTheme.textSecondary },
            ]}
            value={isTitleFocused || titlePinnedRef.current ? titleValue : ""}
            onChangeText={handleTitleChange}
            onFocus={handleTitleFocus}
            onBlur={handleTitleBlur}
            placeholder={isTitleFocused ? "" : titlePlaceholder}
            placeholderTextColor={seasonalTheme.textSecondary}
            returnKeyType="next"
            blurOnSubmit
          />
        )}

        {/* Quill Rich Editor — on native, the persistent editor (mounted at
            the layout level) overlays this area; we just claim/release it. */}
        {!persistentEditor.isAvailable &&
          !isDeleting &&
          (entry || !entryId || wasCreatedAsNew.current) &&
          initialContent !== null && (
            <QuillRichEditor
              key={`editor-${wasCreatedAsNew.current ? "new" : entryId}-${seasonalTheme.isDark ? "dark" : "light"}`}
              ref={localEditorRef}
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
  titleInput: {
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.xs,
  },
});
