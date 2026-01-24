import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { getModelById } from "../ai/modelConfig";
import { usePlatformModels } from "../ai/usePlatformModels";
import { type Agent, type ThinkMode } from "../db/agents";
import { type ModelDownloadInfo } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

interface AgentEditorProps {
  agent?: Agent | null;
  downloadedModels: ModelDownloadInfo[];
  onSave: (data: {
    name: string;
    systemPrompt: string;
    thinkMode: ThinkMode;
    modelId: string;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const THINK_MODE_OPTIONS: {
  value: ThinkMode;
  label: string;
  description: string;
}[] = [
  {
    value: "no-think",
    label: "No Think",
    description: "Concise responses without reasoning (recommended)",
  },
  {
    value: "think",
    label: "Think",
    description: "Shows reasoning process before answering",
  },
  {
    value: "none",
    label: "None",
    description: "Use model's default behavior",
  },
];

export function AgentEditor({
  agent,
  downloadedModels,
  onSave,
  onCancel,
  isLoading = false,
}: AgentEditorProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { hasPlatformLLM } = usePlatformModels();

  // Filter to only LLM models (platform models are excluded - they don't support system prompts properly)
  const llmModels = downloadedModels.filter(
    (m) => !m.modelType || m.modelType === "llm",
  );

  const [name, setName] = useState(agent?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? "");
  const [thinkMode, setThinkMode] = useState<ThinkMode>(
    agent?.thinkMode ?? "no-think",
  );
  const [modelId, setModelId] = useState<string>(
    agent?.modelId ?? llmModels[0]?.modelId ?? "",
  );
  const [showThinkModeDropdown, setShowThinkModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Reset form when agent changes
  useEffect(() => {
    setName(agent?.name ?? "");
    setSystemPrompt(agent?.systemPrompt ?? "");
    setThinkMode(agent?.thinkMode ?? "no-think");
    setModelId(agent?.modelId ?? llmModels[0]?.modelId ?? "");
  }, [agent, llmModels]);

  const isEditing = !!agent;
  const isValid =
    name.trim().length > 0 && systemPrompt.trim().length > 0 && modelId;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      thinkMode,
      modelId,
    });
  };

  const selectedThinkModeOption = THINK_MODE_OPTIONS.find(
    (opt) => opt.value === thinkMode,
  );

  const selectedModel = modelId ? getModelById(modelId) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text
            variant="h3"
            style={[styles.title, { color: seasonalTheme.textPrimary }]}
          >
            {isEditing ? "Edit Persona" : "New Persona"}
          </Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Ionicons
              name="close"
              size={24}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Name Input */}
        <View style={styles.field}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: `${theme.colors.border}40`,
                color: seasonalTheme.textPrimary,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Creative Writer"
            placeholderTextColor={seasonalTheme.textSecondary}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* System Prompt Input */}
        <View style={styles.field}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            System Prompt
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: `${theme.colors.border}40`,
                color: seasonalTheme.textPrimary,
              },
            ]}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder="Describe how the AI should behave..."
            placeholderTextColor={seasonalTheme.textSecondary}
            multiline
            textAlignVertical="top"
            numberOfLines={6}
          />
          <Text
            variant="caption"
            style={[styles.hint, { color: seasonalTheme.textSecondary }]}
          >
            This defines the AI&apos;s personality and behavior
          </Text>
        </View>

        {/* Model Selector */}
        <View style={styles.field}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            Model *
          </Text>
          {/* Info about platform models */}
          {hasPlatformLLM && (
            <View
              style={[
                styles.platformModelInfo,
                { backgroundColor: `${theme.colors.border}15` },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={seasonalTheme.textSecondary}
              />
              <Text
                variant="caption"
                style={{
                  color: seasonalTheme.textSecondary,
                  flex: 1,
                  fontSize: 11,
                }}
              >
                Built-in models (e.g., Gemini Nano) cannot be used with personas
                because they don&apos;t support custom system prompts.
              </Text>
            </View>
          )}
          {llmModels.length === 0 ? (
            <View
              style={[
                styles.noModelsWarning,
                { backgroundColor: `${theme.colors.warning}15` },
              ]}
            >
              <Ionicons
                name="warning-outline"
                size={16}
                color={theme.colors.warning}
              />
              <Text
                variant="caption"
                style={{ color: theme.colors.warning, flex: 1 }}
              >
                No models downloaded. Download a model first.
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.dropdown,
                  {
                    backgroundColor: seasonalTheme.cardBg,
                    borderColor: `${theme.colors.border}40`,
                  },
                ]}
                onPress={() => {
                  setShowModelDropdown(!showModelDropdown);
                  setShowThinkModeDropdown(false);
                }}
              >
                <View style={styles.dropdownContent}>
                  <Text
                    variant="body"
                    style={{ color: seasonalTheme.textPrimary }}
                  >
                    {selectedModel?.displayName ?? "Select a model"}
                  </Text>
                  {selectedModel && (
                    <Text
                      variant="caption"
                      style={{ color: seasonalTheme.textSecondary }}
                    >
                      {selectedModel.size}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={showModelDropdown ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={seasonalTheme.textSecondary}
                />
              </TouchableOpacity>

              {/* Model Dropdown Options */}
              {showModelDropdown && (
                <View
                  style={[
                    styles.dropdownOptions,
                    {
                      backgroundColor: seasonalTheme.gradient.middle,
                      borderColor: `${theme.colors.border}40`,
                    },
                  ]}
                >
                  {llmModels.map((downloaded) => {
                    const model = getModelById(downloaded.modelId);
                    if (!model) return null;
                    const isSelected = modelId === model.modelId;
                    return (
                      <TouchableOpacity
                        key={model.modelId}
                        style={[
                          styles.dropdownOption,
                          isSelected && {
                            backgroundColor: `${theme.colors.accent}15`,
                          },
                        ]}
                        onPress={() => {
                          setModelId(model.modelId);
                          setShowModelDropdown(false);
                        }}
                      >
                        <View style={styles.dropdownOptionContent}>
                          <Text
                            variant="body"
                            style={{
                              color: seasonalTheme.textPrimary,
                              fontWeight: isSelected ? "600" : "400",
                            }}
                          >
                            {model.displayName}
                          </Text>
                          <Text
                            variant="caption"
                            style={{ color: seasonalTheme.textSecondary }}
                          >
                            {model.size}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={theme.colors.accent}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* Think Mode Selector */}
        <View style={styles.field}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            Think Mode
          </Text>
          <TouchableOpacity
            style={[
              styles.dropdown,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: `${theme.colors.border}40`,
              },
            ]}
            onPress={() => {
              setShowThinkModeDropdown(!showThinkModeDropdown);
              setShowModelDropdown(false);
            }}
          >
            <View style={styles.dropdownContent}>
              <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
                {selectedThinkModeOption?.label}
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                {selectedThinkModeOption?.description}
              </Text>
            </View>
            <Ionicons
              name={showThinkModeDropdown ? "chevron-up" : "chevron-down"}
              size={20}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>

          {/* Dropdown Options */}
          {showThinkModeDropdown && (
            <View
              style={[
                styles.dropdownOptions,
                {
                  backgroundColor: seasonalTheme.gradient.middle,
                  borderColor: `${theme.colors.border}40`,
                },
              ]}
            >
              {THINK_MODE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.dropdownOption,
                    thinkMode === option.value && {
                      backgroundColor: `${theme.colors.accent}15`,
                    },
                  ]}
                  onPress={() => {
                    setThinkMode(option.value);
                    setShowThinkModeDropdown(false);
                  }}
                >
                  <View style={styles.dropdownOptionContent}>
                    <Text
                      variant="body"
                      style={{
                        color: seasonalTheme.textPrimary,
                        fontWeight: thinkMode === option.value ? "600" : "400",
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: seasonalTheme.textSecondary }}
                    >
                      {option.description}
                    </Text>
                  </View>
                  {thinkMode === option.value && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={theme.colors.accent}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.cancelButton,
              { borderColor: `${theme.colors.border}40` },
            ]}
            onPress={onCancel}
          >
            <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.saveButton,
              {
                backgroundColor: isValid
                  ? theme.colors.accent
                  : `${theme.colors.accent}40`,
              },
            ]}
            onPress={handleSave}
            disabled={!isValid || isLoading}
          >
            <Text variant="body" style={{ color: "white", fontWeight: "600" }}>
              {isLoading
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Persona"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacingPatterns.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacingPatterns.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    padding: spacingPatterns.xxs,
  },
  field: {
    marginBottom: spacingPatterns.md,
  },
  label: {
    marginBottom: spacingPatterns.xs,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    fontSize: 16,
    minHeight: 120,
  },
  hint: {
    marginTop: spacingPatterns.xs,
    fontSize: 11,
  },
  noModelsWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.sm,
  },
  platformModelInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacingPatterns.sm,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
  },
  dropdownContent: {
    flex: 1,
    gap: 2,
  },
  dropdownOptions: {
    marginTop: spacingPatterns.xs,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacingPatterns.sm,
  },
  dropdownOptionContent: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
    marginTop: spacingPatterns.lg,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    alignItems: "center",
  },
  saveButton: {
    flex: 2,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    alignItems: "center",
  },
});
