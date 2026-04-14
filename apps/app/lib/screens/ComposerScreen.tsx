import React, { useState, useEffect, useRef, useCallback } from "react";
import { useEntryRepository, EntryType } from "../db/entries";
import { AIChatComposer } from "./AIChatComposer";
import { JournalComposer } from "./JournalComposer";

export interface ComposerScreenProps {
  onSave?: (entryId: number) => void;
  onCancel?: () => void | Promise<void>; // Can be async to allow force save
  initialType?: EntryType;
  initialContent?: string;
  entryId?: number; // For editing existing entries
  parentId?: number; // For creating check-ins linked to a parent entry
  fullScreen?: boolean;
  /** Hide the back button (e.g., in sidebar layout) */
  hideBackButton?: boolean;
  /** Called by AI chat with model info for header rendering */
  onModelInfo?: (info: {
    displayName: string;
    openSelector: () => void;
  }) => void;
  /** Called by AI chat when its active entry id changes (new-chat creation) */
  onComposerEntryId?: (id: number | undefined) => void;
}

export function ComposerScreen({
  onSave,
  onCancel,
  initialType = "journal",
  initialContent = "",
  entryId,
  parentId,
  fullScreen = false,
  hideBackButton = false,
  onModelInfo,
  onComposerEntryId,
}: ComposerScreenProps) {
  const entryRepository = useEntryRepository();
  // Use initialType if provided (navigation knows the type), otherwise undefined until loaded
  const [entryType, setEntryType] = useState<EntryType | undefined>(
    initialType,
  );
  const [actualEntryId, setActualEntryId] = useState<number | undefined>(
    entryId,
  );
  const hasLoadedEntryRef = useRef<number | null>(null);

  // Load existing entry if entryId is provided (only once per entryId)
  useEffect(() => {
    if (!entryId) {
      hasLoadedEntryRef.current = null;
      return;
    }

    // Only load if we haven't loaded this entry yet
    if (hasLoadedEntryRef.current === entryId) {
      return;
    }

    const loadEntry = async () => {
      try {
        const entry = await entryRepository.getById(entryId);
        if (entry) {
          hasLoadedEntryRef.current = entryId;
          setEntryType(entry.type);
          setActualEntryId(entryId);
        } else {
          console.error("Entry not found:", entryId);
        }
      } catch (error) {
        console.error("Error loading entry:", error);
      }
    };

    loadEntry();
  }, [entryId]);

  // Use fullScreen mode for journal entries (same as when creating new), or if explicitly set
  const shouldUseFullScreen = fullScreen || entryType === "journal";

  // Handle cancel for journal entries - just pass through to parent
  // JournalComposer handles fire-and-forget save internally
  const handleJournalCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // Memoize onSave handler for AI chat to prevent re-renders
  const handleAIChatSave = useCallback(
    (newEntryId: number) => {
      if (!actualEntryId) {
        setActualEntryId(newEntryId);
      }
      onSave?.(newEntryId);
    },
    [actualEntryId, onSave],
  );

  // Show UI shell immediately
  // If we have an entryId, show the appropriate composer immediately
  // The composer will handle loading the entry content in the background

  // AI Chat conversation view - show if:
  // 1. entryType is ai_chat (either loaded from entry or set via initialType)
  // 2. We have an entryId and loaded type is not journal (default to AI chat)
  // For new AI chats (no entryId), show AIChatComposer immediately - it will create
  // the entry when the user sends their first message
  if (
    entryType === "ai_chat" ||
    (entryId && actualEntryId && entryType !== "journal")
  ) {
    return (
      <AIChatComposer
        key={`ai-chat-${actualEntryId || "new"}`} // Force remount when entry changes
        entryId={actualEntryId}
        onSave={handleAIChatSave}
        onCancel={onCancel}
        hideBackButton={hideBackButton}
        onModelInfo={onModelInfo}
        onComposerEntryId={onComposerEntryId}
      />
    );
  }

  // Journal composer - show if type is journal OR if we're creating a new journal entry
  if (shouldUseFullScreen) {
    const handleJournalCreated = (newEntryId: number) => {
      setActualEntryId(newEntryId);
      onSave?.(newEntryId);
    };

    return (
      <JournalComposer
        key={`journal-${actualEntryId || "new"}`}
        entryId={actualEntryId}
        initialContent={initialContent}
        parentId={parentId}
        onSave={onSave}
        onCancel={handleJournalCancel}
        onCreated={handleJournalCreated}
        hideBackButton={hideBackButton}
      />
    );
  }

  // Default composer view (should not be reached in normal flow)
  return null;
}
