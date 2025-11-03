import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Button } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useEntryRepository, EntryType, Block } from "../db/entries";

export interface ComposerScreenProps {
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  initialType?: EntryType;
  initialContent?: string;
  fullScreen?: boolean;
}

export function ComposerScreen({
  onSave,
  onCancel,
  initialType = "journal",
  initialContent = "",
  fullScreen = false,
}: ComposerScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const entryRepository = useEntryRepository();
  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      // Don't save empty entries
      onCancel?.();
      return;
    }

    setIsSaving(true);
    try {
      const blocks: Block[] = [];

      if (content.trim()) {
        if (entryType === "journal") {
          // For journal entries, create paragraph blocks from content
          const paragraphs = content
            .split("\n\n")
            .filter((p) => p.trim())
            .map((p) => ({
              type: "paragraph" as const,
              content: p.trim(),
            }));

          blocks.push(...paragraphs);
        } else {
          // For AI chat, create markdown blocks
          blocks.push({
            type: "markdown",
            content: content.trim(),
            role: "user",
          });
        }
      }

      const finalTitle =
        title.trim() ||
        content.trim().slice(0, 50) + (content.length > 50 ? "..." : "") ||
        "Untitled";

      const entry = await entryRepository.create({
        type: entryType,
        title: finalTitle,
        blocks,
        tags: [],
        attachments: [],
        isFavorite: false,
      });

      onSave?.(entry.id);
    } catch (error) {
      console.error("Error saving entry:", error);
      // TODO: Show error message to user
    } finally {
      setIsSaving(false);
    }
  }, [title, content, entryType, entryRepository, onSave, onCancel]);

  if (fullScreen) {
    // Full-screen journal editor - minimal UI
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.fullScreenHeader}>
          <Button variant="ghost" onPress={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={handleSave}
            disabled={isSaving || !content.trim()}
            style={styles.saveButton}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </View>
        <TextInput
          style={[
            styles.fullScreenInput,
            { color: theme.colors.textPrimary, paddingBottom: insets.bottom },
          ]}
          placeholder="Start writing..."
          placeholderTextColor={theme.colors.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          textAlignVertical="top"
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerContent}>
          <View style={styles.typeSelector}>
            <Button
              variant={entryType === "journal" ? "primary" : "secondary"}
              size="sm"
              onPress={() => setEntryType("journal")}
              style={styles.typeButton}
            >
              Journal Entry
            </Button>
            <Button
              variant={entryType === "ai_chat" ? "primary" : "secondary"}
              size="sm"
              onPress={() => setEntryType("ai_chat")}
              style={styles.typeButton}
            >
              AI Chat
            </Button>
          </View>
          <View style={styles.actions}>
            <Button variant="secondary" onPress={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={isSaving}
              style={styles.saveButton}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacingPatterns.screen },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          style={[styles.titleInput, { color: theme.colors.textPrimary }]}
          placeholder="Title (optional)"
          placeholderTextColor={theme.colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          autoFocus
          multiline={false}
        />

        <TextInput
          style={[styles.contentInput, { color: theme.colors.textPrimary }]}
          placeholder={
            entryType === "journal"
              ? "Start writing..."
              : "Type your message..."
          }
          placeholderTextColor={theme.colors.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacingPatterns.screen,
    borderBottomWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  headerContent: {
    gap: spacingPatterns.md,
  },
  typeSelector: {
    flexDirection: "row",
    gap: spacingPatterns.xs,
  },
  typeButton: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacingPatterns.sm,
  },
  saveButton: {
    minWidth: 80,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: spacingPatterns.md,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    minHeight: 50,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    minHeight: 200,
  },
  fullScreenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  fullScreenInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
});
