/**
 * Add Remote Model Modal
 *
 * Modal for adding remote API models using OpenAI-compatible or Anthropic APIs.
 * Simplified flow: select API style, enter connection details, acknowledge privacy.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { storeApiKey } from "../ai/apiKeyStorage";
import { API_STYLES, type ApiStyleConfig } from "../ai/customModels";
import {
  generateRemoteModelId,
  generateApiKeyRef,
} from "../ai/modelTypeGuards";
import { useCustomModels } from "../db/useCustomModels";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { FormField } from "./FormField";
import { FormModal } from "./FormModal";
import { Input } from "./Input";
import { RemoteModelPrivacyBanner } from "./RemoteModelPrivacyBanner";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";
import type { CustomModelConfig } from "../ai/customModels";

export interface AddRemoteModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelAdded?: (modelId: string) => void;
  /** Optional model to edit. When provided, modal operates in edit mode. */
  editModel?: CustomModelConfig | null;
}

type Step = "apiStyle" | "details" | "privacy";

export function AddRemoteModelModal({
  visible,
  onClose,
  onModelAdded,
  editModel,
}: AddRemoteModelModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { showToast } = useToast();
  const customModels = useCustomModels();

  const isEditMode = !!editModel;

  // Form state
  const [step, setStep] = useState<Step>("apiStyle");
  const [selectedStyle, setSelectedStyle] = useState<ApiStyleConfig | null>(
    null,
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when editing
  React.useEffect(() => {
    if (editModel && visible && editModel.modelType === "remote-api") {
      // Skip to details step when editing
      setStep("details");
      // Find the matching API style
      const style =
        API_STYLES.find((s) => s.id === editModel.providerId) || API_STYLES[0];
      setSelectedStyle(style);
      setBaseUrl(editModel.baseUrl || style.defaultBaseUrl);
      setModelName(editModel.modelName || "");
      setDisplayName(editModel.displayName);
      // API key is not shown (security) - leave empty
      setApiKey("");
    }
  }, [editModel, visible]);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setStep("apiStyle");
    setSelectedStyle(null);
    setBaseUrl("");
    setModelName("");
    setApiKey("");
    setDisplayName("");
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  // Handle API style selection
  const handleSelectStyle = useCallback((style: ApiStyleConfig) => {
    setSelectedStyle(style);
    setBaseUrl(style.defaultBaseUrl);
    setStep("details");
  }, []);

  // Handle details submission
  const handleDetailsSubmit = useCallback(() => {
    if (!baseUrl.trim()) {
      showToast("Please enter a base URL", "error");
      return;
    }
    if (!modelName.trim()) {
      showToast("Please enter a model name", "error");
      return;
    }
    // API key is optional for self-hosted models
    setStep("privacy");
  }, [baseUrl, modelName, showToast]);

  // Handle privacy acknowledgment and final submission
  const handlePrivacyAcknowledge = useCallback(async () => {
    if (!selectedStyle) return;

    setIsSubmitting(true);

    try {
      const finalDisplayName = displayName.trim() || modelName;

      if (isEditMode && editModel) {
        // Update existing model
        await customModels.update(editModel.modelId, {
          displayName: finalDisplayName,
        });

        // Update API key if provided
        if (apiKey.trim()) {
          const existingApiKeyRef =
            editModel.modelType === "remote-api" ? editModel.apiKeyRef : null;
          if (existingApiKeyRef) {
            await storeApiKey(existingApiKeyRef, apiKey.trim());
          }
        }

        showToast(`${finalDisplayName} updated successfully`, "success");
        onModelAdded?.(editModel.modelId);
      } else {
        // Generate model ID and API key reference
        const modelId = generateRemoteModelId(selectedStyle.id, modelName);
        const apiKeyRef = generateApiKeyRef(modelId);

        // Store API key in secure storage (only if provided)
        if (apiKey.trim()) {
          await storeApiKey(apiKeyRef, apiKey.trim());
        }

        // Create remote model in database
        const createdModel = await customModels.createRemoteModel({
          displayName: finalDisplayName,
          description: `${selectedStyle.displayName} API model`,
          providerId: selectedStyle.id,
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          temperature: 0.7,
        });

        // Mark privacy as acknowledged
        await customModels.acknowledgePrivacy(createdModel.modelId);

        showToast(`${finalDisplayName} added successfully`, "success");
        onModelAdded?.(createdModel.modelId);
      }
      handleClose();
    } catch (error) {
      const err = error as { message?: string };
      showToast(
        err?.message ||
          (isEditMode ? "Failed to update model" : "Failed to add model"),
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedStyle,
    apiKey,
    baseUrl,
    modelName,
    displayName,
    customModels,
    showToast,
    onModelAdded,
    handleClose,
    isEditMode,
    editModel,
  ]);

  // Get step title
  const stepTitle = useMemo(() => {
    if (isEditMode) {
      switch (step) {
        case "apiStyle":
          return "Select API Style";
        case "details":
          return "Edit Connection Details";
        case "privacy":
          return "Confirm Changes";
      }
    }
    switch (step) {
      case "apiStyle":
        return "Select API Style";
      case "details":
        return "Connection Details";
      case "privacy":
        return "Privacy Notice";
    }
  }, [step]);

  // Can go back?
  const canGoBack = step !== "apiStyle";

  const handleBack = useCallback(() => {
    switch (step) {
      case "details":
        setStep("apiStyle");
        setSelectedStyle(null);
        setBaseUrl("");
        break;
      case "privacy":
        setStep("details");
        break;
    }
  }, [step]);

  // Footer for step 2 (details)
  const detailsFooter =
    step === "details" ? (
      <TouchableOpacity
        style={[
          styles.continueButton,
          { backgroundColor: theme.colors.accent },
        ]}
        onPress={handleDetailsSubmit}
      >
        <Text variant="body" style={{ color: "white", fontWeight: "600" }}>
          Continue
        </Text>
        <Ionicons name="arrow-forward" size={18} color="white" />
      </TouchableOpacity>
    ) : undefined;

  return (
    <FormModal
      visible={visible}
      onClose={handleClose}
      title={stepTitle}
      onBack={canGoBack ? handleBack : undefined}
      maxHeightRatio={0.75}
      footer={detailsFooter}
    >
      {/* Step 1: API Style Selection */}
      {step === "apiStyle" && (
        <View style={styles.stepContent}>
          <Text
            variant="caption"
            style={{
              color: seasonalTheme.textSecondary,
              marginBottom: spacingPatterns.sm,
            }}
          >
            Choose the API format your provider uses.
          </Text>
          {API_STYLES.map((style) => (
            <TouchableOpacity
              key={style.id}
              style={[
                styles.optionCard,
                {
                  backgroundColor: seasonalTheme.cardBg,
                  borderColor: `${theme.colors.border}40`,
                },
              ]}
              onPress={() => handleSelectStyle(style)}
            >
              <View style={styles.optionContent}>
                <View style={styles.optionHeader}>
                  <Ionicons
                    name="cloud-outline"
                    size={20}
                    color={theme.colors.accent}
                  />
                  <Text
                    variant="body"
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontWeight: "600",
                    }}
                  >
                    {style.displayName}
                  </Text>
                </View>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  {style.description}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={seasonalTheme.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Step 2: Connection Details */}
      {step === "details" && selectedStyle && (
        <View style={styles.stepContent}>
          <FormField label="Base URL">
            <Input
              placeholder={selectedStyle.defaultBaseUrl}
              value={baseUrl}
              onChangeText={setBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField label="Model Name">
            <Input
              placeholder={
                selectedStyle.id === "anthropic"
                  ? "claude-3-5-sonnet-20241022"
                  : "gpt-4o"
              }
              value={modelName}
              onChangeText={setModelName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField label="API Key (optional for self-hosted)">
            <Input
              placeholder={
                selectedStyle.id === "anthropic" ? "sk-ant-..." : "sk-..."
              }
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField label="Display Name (optional)" marginBottom={false}>
            <Input
              placeholder={modelName || "My Remote Model"}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </FormField>

          <View style={styles.securityNote}>
            <Ionicons
              name="lock-closed-outline"
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
              Your API key is stored securely in your device's keychain and
              never sent to our servers.
            </Text>
          </View>
        </View>
      )}

      {/* Step 3: Privacy Acknowledgment */}
      {step === "privacy" && selectedStyle && (
        <View style={styles.stepContent}>
          <RemoteModelPrivacyBanner
            providerName={selectedStyle.displayName}
            isAcknowledged={false}
            onAcknowledge={handlePrivacyAcknowledge}
            onCancel={handleBack}
            variant="dialog"
          />
          {isSubmitting && (
            <Text
              variant="caption"
              style={{
                color: seasonalTheme.textSecondary,
                textAlign: "center",
                marginTop: spacingPatterns.sm,
              }}
            >
              Adding model...
            </Text>
          )}
        </View>
      )}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  stepContent: {
    padding: spacingPatterns.md,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    marginBottom: spacingPatterns.xs,
  },
  optionContent: {
    flex: 1,
    gap: 2,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: borderRadius.sm,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
  },
});
