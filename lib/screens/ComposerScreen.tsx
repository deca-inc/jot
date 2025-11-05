import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { useEntryRepository, EntryType } from "../db/entries";
import { JournalComposer } from "./JournalComposer";
import { AIChatComposer } from "./AIChatComposer";

export interface ComposerScreenProps {
  onSave?: (entryId: number) => void;
  onCancel?: () => void | Promise<void>; // Can be async to allow force save
  onDelete?: (entryId: number) => void;
  initialType?: EntryType;
  initialContent?: string;
  entryId?: number; // For editing existing entries
  fullScreen?: boolean;
}

export function ComposerScreen({
  onSave,
  onCancel,
  onDelete,
  initialType = "journal",
  initialContent = "",
  entryId,
  fullScreen = false,
}: ComposerScreenProps) {
  const theme = useTheme();
  const entryRepository = useEntryRepository();
  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [isLoading, setIsLoading] = useState(!!entryId);
  const [actualEntryId, setActualEntryId] = useState<number | undefined>(
    entryId
  );
  const hasLoadedEntryRef = useRef<number | null>(null);
  const journalComposerForceSaveRef = useRef<(() => Promise<void>) | null>(
    null
  );

  // Load existing entry if entryId is provided (only once per entryId)
  useEffect(() => {
    if (!entryId) {
      setIsLoading(false);
      hasLoadedEntryRef.current = null;

      // If no entryId and we need one, create it for journal entries
      if (initialType === "journal" && !actualEntryId) {
        setIsLoading(true);
        const createEntry = async () => {
          try {
            const blocks = initialContent.trim()
              ? initialContent
                  .split("\n\n")
                  .filter((p) => p.trim())
                  .map((p) => ({
                    type: "paragraph" as const,
                    content: p.trim(),
                  }))
              : [
                  {
                    type: "paragraph" as const,
                    content: "",
                  },
                ];

            const entry = await entryRepository.create({
              type: "journal",
              title: initialContent.trim()
                ? initialContent.trim().slice(0, 50) +
                  (initialContent.length > 50 ? "..." : "")
                : "Untitled",
              blocks,
              tags: [],
              attachments: [],
              isFavorite: false,
            });

            console.log(
              "Created entry",
              entry.id,
              "with",
              blocks.length,
              "blocks"
            );
            setActualEntryId(entry.id);
          } catch (error) {
            console.error("Error creating entry:", error);
          } finally {
            setIsLoading(false);
          }
        };

        createEntry();
      }
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
          console.log(
            "Loaded entry",
            entryId,
            "type:",
            entry.type,
            "blocks:",
            entry.blocks.length
          );
          hasLoadedEntryRef.current = entryId;
          setEntryType(entry.type);
          setActualEntryId(entryId);
        } else {
          console.error("Entry not found:", entryId);
        }
      } catch (error) {
        console.error("Error loading entry:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  // Use fullScreen mode for journal entries (same as when creating new), or if explicitly set
  const shouldUseFullScreen = fullScreen || entryType === "journal";

  // Handle cancel with force save for journal entries
  // Define BEFORE any conditional returns to keep hook order stable
  const handleJournalCancel = useCallback(async () => {
    // Force save before canceling if there's a save function
    if (journalComposerForceSaveRef.current) {
      await journalComposerForceSaveRef.current();
    }
    // Call parent's onCancel (which may be async)
    await onCancel?.();
  }, [onCancel]);

  if (isLoading || (shouldUseFullScreen && !actualEntryId)) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  if (shouldUseFullScreen && actualEntryId) {
    // Full-screen journal editor - minimal UI with auto-save
    return (
      <JournalComposer
        entryId={actualEntryId}
        onSave={onSave}
        onCancel={handleJournalCancel}
        onDelete={onDelete}
        forceSaveRef={journalComposerForceSaveRef}
      />
    );
  }

  // AI Chat conversation view
  if (entryType === "ai_chat") {
    return (
      <AIChatComposer
        key={`ai-chat-${actualEntryId || "new"}`} // Force remount when entry changes
        entryId={actualEntryId}
        onSave={(newEntryId) => {
          if (!actualEntryId) {
            setActualEntryId(newEntryId);
          }
          onSave?.(newEntryId);
        }}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    );
  }

  // Default composer view (should not be reached in normal flow)
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
