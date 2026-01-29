/**
 * Add Remote Model Modal
 *
 * Modal for adding remote API models. Provider is auto-detected from URL.
 * Simplified flow: enter connection details, acknowledge privacy.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { storeApiKey } from "../ai/apiKeyStorage";
import {
  detectProviderFromUrl,
  isWebSocketUrl,
  type ProviderConfig,
} from "../ai/customModels";
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
import type { CustomModelConfig, ModelCategory } from "../ai/customModels";

export interface AddRemoteModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelAdded?: (modelId: string) => void | Promise<void>;
  /** Optional model to edit. When provided, modal operates in edit mode. */
  editModel?: CustomModelConfig | null;
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text. Defaults to 'llm' */
  modelCategory?: ModelCategory;
}

type Step = "details" | "privacy";

export function AddRemoteModelModal({
  visible,
  onClose,
  onModelAdded,
  editModel,
  modelCategory = "llm",
}: AddRemoteModelModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { showToast } = useToast();
  const customModels = useCustomModels();

  const isEditMode = !!editModel;

  // Form state
  const [step, setStep] = useState<Step>("details");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect provider from URL
  const detectedProvider: ProviderConfig = useMemo(() => {
    return detectProviderFromUrl(baseUrl);
  }, [baseUrl]);

  // Check if URL is a WebSocket URL (implies real-time)
  const isWsUrl = isWebSocketUrl(baseUrl);

  // Populate form when editing
  React.useEffect(() => {
    if (editModel && visible && editModel.modelType === "remote-api") {
      setStep("details");
      setBaseUrl(editModel.baseUrl || "");
      setModelName(editModel.modelName || "");
      setDisplayName(editModel.displayName);
      // API key is not shown (security) - leave empty
      setApiKey("");
    }
  }, [editModel, visible]);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setStep("details");
    setBaseUrl("");
    setModelName("");
    setApiKey("");
    setDisplayName("");
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

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
    setIsSubmitting(true);

    try {
      const finalDisplayName = displayName.trim() || modelName;

      if (isEditMode && editModel) {
        // Update existing model
        await customModels.update(editModel.modelId, {
          displayName: finalDisplayName,
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
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
        await onModelAdded?.(editModel.modelId);
      } else {
        // Generate model ID and API key reference
        const modelId = generateRemoteModelId(detectedProvider.id, modelName);
        const apiKeyRef = generateApiKeyRef(modelId);

        // Store API key in secure storage (only if provided)
        if (apiKey.trim()) {
          await storeApiKey(apiKeyRef, apiKey.trim());
        }

        // Create remote model in database
        const createdModel = await customModels.createRemoteModel({
          displayName: finalDisplayName,
          description: `${detectedProvider.displayName} ${modelCategory === "stt" ? "voice" : ""} model`,
          modelCategory,
          providerId: detectedProvider.id,
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          temperature: modelCategory === "llm" ? 0.7 : undefined,
        });

        // Mark privacy as acknowledged
        await customModels.acknowledgePrivacy(createdModel.modelId);

        showToast(`${finalDisplayName} added successfully`, "success");
        await onModelAdded?.(createdModel.modelId);
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
    detectedProvider,
    apiKey,
    baseUrl,
    modelName,
    displayName,
    modelCategory,
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
      return step === "details" ? "Edit Connection Details" : "Confirm Changes";
    }
    return step === "details"
      ? modelCategory === "stt"
        ? "Add Remote Voice Model"
        : "Add Remote Model"
      : "Privacy Notice";
  }, [step, isEditMode, modelCategory]);

  // Can go back?
  const canGoBack = step === "privacy";

  const handleBack = useCallback(() => {
    if (step === "privacy") {
      setStep("details");
    }
  }, [step]);

  // Footer for details step
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
      {/* Connection Details */}
      {step === "details" && (
        <View style={styles.stepContent}>
          <FormField label="API Endpoint URL">
            <Input
              placeholder={
                modelCategory === "stt"
                  ? "wss://api.deepgram.com/v1/listen"
                  : "https://api.openai.com/v1/chat/completions"
              }
              value={baseUrl}
              onChangeText={setBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          {/* Show detected provider */}
          {baseUrl.trim() && (
            <View style={styles.providerBadge}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={theme.colors.accent}
              />
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Detected: {detectedProvider.displayName}
                {isWsUrl && modelCategory === "stt" && " (Real-Time)"}
              </Text>
            </View>
          )}

          <FormField label="Model Name">
            <Input
              placeholder={detectedProvider.modelPlaceholder || "model-name"}
              value={modelName}
              onChangeText={setModelName}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField
            label="API Key (optional for self-hosted)"
            hint={
              isEditMode &&
              editModel?.modelType === "remote-api" &&
              editModel.apiKeyRef
                ? "Leave blank to keep existing key"
                : undefined
            }
          >
            <Input
              placeholder={
                isEditMode &&
                editModel?.modelType === "remote-api" &&
                editModel.apiKeyRef
                  ? "••••••••••••••••"
                  : detectedProvider.apiKeyPlaceholder || "your-api-key"
              }
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FormField>

          <FormField label="Display Name (optional)">
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

      {/* Privacy Acknowledgment */}
      {step === "privacy" && (
        <View style={styles.stepContent}>
          <RemoteModelPrivacyBanner
            providerName={detectedProvider.displayName}
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
  providerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginTop: -spacingPatterns.sm,
    marginBottom: spacingPatterns.md,
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
