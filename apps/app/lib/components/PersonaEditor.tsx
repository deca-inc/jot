/**
 * Persona Editor Modal
 *
 * Modal for creating and editing AI personas with custom system prompts,
 * think modes, and model selection.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { getModelById } from "../ai/modelConfig";
import { usePlatformModels } from "../ai/usePlatformModels";
import { type Agent, type ThinkMode } from "../db/agents";
import { type ModelDownloadInfo } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { FormField } from "./FormField";
import { FormModal } from "./FormModal";
import { Input } from "./Input";
import { Text } from "./Text";
import type {
  CustomLocalModelConfig,
  RemoteModelConfig,
} from "../ai/customModels";

/** Unified model option for the dropdown */
interface ModelOption {
  modelId: string;
  displayName: string;
  description: string;
  type: "built-in" | "custom-local" | "remote";
  icon: "hardware-chip-outline" | "cube-outline" | "cloud-outline";
}

export interface PersonaEditorProps {
  visible: boolean;
  onClose: () => void;
  persona?: Agent | null;
  downloadedModels: ModelDownloadInfo[];
  /** Custom local models that are downloaded and enabled */
  customLocalModels?: CustomLocalModelConfig[];
  /** Remote API models that are enabled and privacy acknowledged */
  remoteModels?: RemoteModelConfig[];
  onSave: (data: {
    name: string;
    systemPrompt: string;
    thinkMode: ThinkMode;
    modelId: string;
  }) => void;
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

export function PersonaEditor({
  visible,
  onClose,
  persona,
  downloadedModels,
  customLocalModels = [],
  remoteModels = [],
  onSave,
  isLoading = false,
}: PersonaEditorProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { hasPlatformLLM } = usePlatformModels();

  const dialogBackground = seasonalTheme.gradient.middle;

  // Filter to only LLM models (platform models are excluded - they don't support system prompts properly)
  const llmModels = downloadedModels.filter(
    (m) => !m.modelType || m.modelType === "llm",
  );

  // Build unified model options list
  const modelOptions = useMemo((): ModelOption[] => {
    const options: ModelOption[] = [];

    // Add built-in downloaded models
    llmModels.forEach((downloaded) => {
      const model = getModelById(downloaded.modelId);
      if (model) {
        options.push({
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.size,
          type: "built-in",
          icon: "cube-outline",
        });
      }
    });

    // Add custom local models (downloaded and enabled)
    customLocalModels
      .filter((m) => m.isDownloaded && m.isEnabled)
      .forEach((model) => {
        options.push({
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.modelSize || "Custom · On-device",
          type: "custom-local",
          icon: "hardware-chip-outline",
        });
      });

    // Add remote API models (enabled and privacy acknowledged)
    remoteModels
      .filter((m) => m.isEnabled && m.privacyAcknowledged)
      .forEach((model) => {
        options.push({
          modelId: model.modelId,
          displayName: model.displayName,
          description: `${model.providerId} · ${model.modelName}`,
          type: "remote",
          icon: "cloud-outline",
        });
      });

    return options;
  }, [llmModels, customLocalModels, remoteModels]);

  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [thinkMode, setThinkMode] = useState<ThinkMode>("no-think");
  const [modelId, setModelId] = useState<string>("");
  const [showThinkModeDropdown, setShowThinkModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Reset form when modal opens or persona changes
  const firstModelId = modelOptions[0]?.modelId ?? "";
  useEffect(() => {
    if (visible) {
      setName(persona?.name ?? "");
      setSystemPrompt(persona?.systemPrompt ?? "");
      setThinkMode(persona?.thinkMode ?? "no-think");
      setModelId(persona?.modelId ?? firstModelId);
      setShowThinkModeDropdown(false);
      setShowModelDropdown(false);
    }
  }, [visible, persona, firstModelId]);

  const isEditing = !!persona;
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

  const selectedModelOption = modelOptions.find((m) => m.modelId === modelId);

  const footer = (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[
          styles.cancelButton,
          { borderColor: `${theme.colors.border}40` },
        ]}
        onPress={onClose}
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
  );

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={isEditing ? "Edit Persona" : "New Persona"}
      footer={footer}
    >
      {/* Name Input */}
      <FormField label="Name">
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g., Creative Writer"
          autoCapitalize="words"
          autoCorrect={false}
        />
      </FormField>

      {/* System Prompt Input */}
      <FormField
        label="System Prompt"
        hint="This defines the AI's personality and behavior"
      >
        <Input
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          placeholder="Describe how the AI should behave..."
          multiline
          numberOfLines={6}
          minHeight={100}
        />
      </FormField>

      {/* Model Selector */}
      <FormField label="Model *">
        {modelOptions.length === 0 ? (
          <View
            style={[
              styles.warningBox,
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
              No models available. Download a model or add a remote API model
              first.
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
                <View style={styles.modelLabelRow}>
                  {selectedModelOption && (
                    <Ionicons
                      name={selectedModelOption.icon}
                      size={16}
                      color={seasonalTheme.textSecondary}
                    />
                  )}
                  <Text
                    variant="body"
                    style={{ color: seasonalTheme.textPrimary }}
                  >
                    {selectedModelOption?.displayName ?? "Select a model"}
                  </Text>
                </View>
                {selectedModelOption && (
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary }}
                  >
                    {selectedModelOption.description}
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
                    backgroundColor: dialogBackground,
                    borderColor: `${theme.colors.border}40`,
                  },
                ]}
              >
                {modelOptions.map((option) => {
                  const isSelected = modelId === option.modelId;
                  return (
                    <TouchableOpacity
                      key={option.modelId}
                      style={[
                        styles.dropdownOption,
                        isSelected && {
                          backgroundColor: `${theme.colors.accent}15`,
                        },
                      ]}
                      onPress={() => {
                        setModelId(option.modelId);
                        setShowModelDropdown(false);
                      }}
                    >
                      <View style={styles.dropdownOptionContent}>
                        <View style={styles.modelLabelRow}>
                          <Ionicons
                            name={option.icon}
                            size={16}
                            color={seasonalTheme.textSecondary}
                          />
                          <Text
                            variant="body"
                            style={{
                              color: seasonalTheme.textPrimary,
                              fontWeight: isSelected ? "600" : "400",
                            }}
                          >
                            {option.displayName}
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{ color: seasonalTheme.textSecondary }}
                        >
                          {option.description}
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
            {/* Info about platform models */}
            {hasPlatformLLM && (
              <View style={styles.platformNote}>
                <Ionicons
                  name="information-circle-outline"
                  size={12}
                  color={seasonalTheme.textSecondary}
                />
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    fontSize: 11,
                  }}
                >
                  Built-in models (Apple, Gemini) not supported
                </Text>
              </View>
            )}
          </>
        )}
      </FormField>

      {/* Think Mode Selector */}
      <FormField label="Think Mode" marginBottom={false}>
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
                backgroundColor: dialogBackground,
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
      </FormField>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.sm,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
  },
  dropdownContent: {
    flex: 1,
    gap: 2,
  },
  modelLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  dropdownOptions: {
    marginTop: spacingPatterns.xs,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
  },
  dropdownOptionContent: {
    flex: 1,
    gap: 2,
  },
  platformNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xxs,
    marginTop: spacingPatterns.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacingPatterns.sm,
    alignItems: "center",
  },
  saveButton: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacingPatterns.sm,
    alignItems: "center",
  },
});
