/**
 * Add Custom Local Model Modal
 *
 * Modal for adding user-provided models. Platform-aware:
 * - Mobile (iOS/Android): ExecuTorch (.pte) models from HuggingFace
 * - Desktop (Tauri/macOS): GGUF models from HuggingFace
 * - Web: MLC model IDs for web-llm
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { getCurrentPlatform } from "../ai/platformFilter";
import { useCustomModels } from "../db/useCustomModels";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { FormField } from "./FormField";
import { FormModal } from "./FormModal";
import { Input } from "./Input";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";
import type { CustomLocalModelConfig } from "../ai/customModels";

export interface AddCustomLocalModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelAdded?: (modelId: string) => void | Promise<void>;
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text. Defaults to 'llm' */
  modelCategory?: "llm" | "stt";
  /** Optional model to edit. When provided, modal operates in edit mode. */
  editModel?: CustomLocalModelConfig | null;
}

/**
 * Extract filename from a URL
 */
function getFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").pop() || "";
  } catch {
    return url.split("/").pop() || "";
  }
}

/**
 * Generate a folder name from display name
 */
function generateFolderName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function AddCustomLocalModelModal({
  visible,
  onClose,
  onModelAdded,
  modelCategory = "llm",
  editModel,
}: AddCustomLocalModelModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { showToast } = useToast();
  const customModels = useCustomModels();

  const isEditMode = !!editModel;

  // Platform detection
  const platform = getCurrentPlatform();
  const isDesktop = platform === "tauri" || platform === "macos";
  const isWeb = platform === "web";

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [pteUrl, setPteUrl] = useState("");
  const [tokenizerUrl, setTokenizerUrl] = useState("");
  const [tokenizerConfigUrl, setTokenizerConfigUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if URLs changed (for edit mode)
  const urlsChanged =
    isEditMode &&
    editModel &&
    (pteUrl !== (editModel.huggingFaceUrl || "") ||
      tokenizerUrl !== (editModel.tokenizerUrl || "") ||
      tokenizerConfigUrl !== (editModel.tokenizerConfigUrl || ""));

  // Populate form when editing
  React.useEffect(() => {
    if (editModel && visible) {
      setDisplayName(editModel.displayName);
      setPteUrl(editModel.huggingFaceUrl || "");
      setTokenizerUrl(editModel.tokenizerUrl || "");
      setTokenizerConfigUrl(editModel.tokenizerConfigUrl || "");
    }
  }, [editModel, visible]);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setDisplayName("");
    setPteUrl("");
    setTokenizerUrl("");
    setTokenizerConfigUrl("");
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    // Validation
    if (!displayName.trim()) {
      showToast("Please enter a display name", "error");
      return;
    }

    if (!pteUrl.trim()) {
      const fieldLabel = isWeb
        ? "MLC Model ID"
        : isDesktop
          ? "model file URL"
          : "model file URL";
      showToast(`Please enter the ${fieldLabel}`, "error");
      return;
    }

    // URL validation (web uses model IDs, not URLs)
    if (!isWeb && !pteUrl.includes("huggingface.co")) {
      showToast("Please use a HuggingFace URL", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && editModel) {
        // Extract new filenames if URLs changed (not applicable for web MLC IDs)
        const newTokenizerFileName =
          !isWeb && tokenizerUrl.trim()
            ? getFilenameFromUrl(tokenizerUrl)
            : null;
        const newTokenizerConfigFileName =
          !isWeb && tokenizerConfigUrl.trim()
            ? getFilenameFromUrl(tokenizerConfigUrl)
            : null;

        // Update existing model
        await customModels.update(editModel.modelId, {
          displayName: displayName.trim(),
          huggingFaceUrl: pteUrl.trim(),
          tokenizerUrl: isWeb ? null : tokenizerUrl.trim() || null,
          tokenizerConfigUrl: isWeb ? null : tokenizerConfigUrl.trim() || null,
          tokenizerFileName: newTokenizerFileName,
          tokenizerConfigFileName: newTokenizerConfigFileName,
          // Mark as not downloaded if URLs changed
          isDownloaded: urlsChanged ? false : undefined,
        });

        showToast(
          urlsChanged
            ? `${displayName} updated. Download to apply changes.`
            : `${displayName} updated successfully`,
          "success",
        );
        await onModelAdded?.(editModel.modelId);
      } else {
        // Platform-specific file validation
        if (isWeb) {
          // Web: pteUrl is actually an MLC model ID, no file extension validation
          const folderName = generateFolderName(displayName);

          const createdModel = await customModels.createCustomLocalModel({
            displayName: displayName.trim(),
            modelCategory,
            huggingFaceUrl: pteUrl.trim(), // Stores the MLC model ID
            folderName,
            pteFileName: pteUrl.trim(), // Use the model ID as the file identifier
          });

          showToast(`${displayName} added successfully`, "success");
          await onModelAdded?.(createdModel.modelId);
        } else {
          // Desktop or mobile: extract filenames from URLs
          const pteFileName = getFilenameFromUrl(pteUrl);
          const tokenizerFileName = tokenizerUrl.trim()
            ? getFilenameFromUrl(tokenizerUrl)
            : undefined;
          const tokenizerConfigFileName = tokenizerConfigUrl.trim()
            ? getFilenameFromUrl(tokenizerConfigUrl)
            : undefined;

          // Validate file extension
          if (isDesktop) {
            if (!pteFileName.endsWith(".gguf")) {
              showToast("Model file must be a .gguf file", "error");
              setIsSubmitting(false);
              return;
            }
          } else {
            // Mobile
            if (!pteFileName.endsWith(".pte")) {
              showToast("Model file must be a .pte file", "error");
              setIsSubmitting(false);
              return;
            }
          }

          const folderName = generateFolderName(displayName);

          const createdModel = await customModels.createCustomLocalModel({
            displayName: displayName.trim(),
            modelCategory,
            huggingFaceUrl: pteUrl.trim(),
            tokenizerUrl: tokenizerUrl.trim() || undefined,
            tokenizerConfigUrl: tokenizerConfigUrl.trim() || undefined,
            folderName,
            pteFileName,
            tokenizerFileName,
            tokenizerConfigFileName,
          });

          showToast(`${displayName} added successfully`, "success");
          await onModelAdded?.(createdModel.modelId);
        }
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
    displayName,
    pteUrl,
    tokenizerUrl,
    tokenizerConfigUrl,
    customModels,
    showToast,
    onModelAdded,
    handleClose,
    modelCategory,
    isEditMode,
    editModel,
    urlsChanged,
    isWeb,
    isDesktop,
  ]);

  const modalTitle = isEditMode
    ? modelCategory === "stt"
      ? "Edit Custom Voice Model"
      : "Edit Custom Model"
    : modelCategory === "stt"
      ? "Add Custom Voice Model"
      : "Add Custom Model";

  const footer = (
    <TouchableOpacity
      style={[
        styles.submitButton,
        { backgroundColor: theme.colors.accent },
        isSubmitting && styles.submitButtonDisabled,
      ]}
      onPress={handleSubmit}
      disabled={isSubmitting}
    >
      <Ionicons
        name={
          isEditMode && urlsChanged
            ? "cloud-download-outline"
            : isEditMode
              ? "checkmark-circle-outline"
              : "add-circle-outline"
        }
        size={20}
        color="white"
      />
      <Text variant="body" style={{ color: "white", fontWeight: "600" }}>
        {isSubmitting
          ? isEditMode
            ? "Saving..."
            : "Adding..."
          : isEditMode && urlsChanged
            ? "Save & Re-download"
            : isEditMode
              ? "Save Changes"
              : "Add Model"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <FormModal
      visible={visible}
      onClose={handleClose}
      title={modalTitle}
      footer={footer}
      maxHeightRatio={0.85}
    >
      {/* Info banner */}
      <View
        style={[
          styles.infoBanner,
          { backgroundColor: `${theme.colors.accent}15` },
        ]}
      >
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={theme.colors.accent}
        />
        <Text
          variant="caption"
          style={{ color: seasonalTheme.textSecondary, flex: 1 }}
        >
          {isEditMode
            ? isWeb
              ? "Edit model details. Changing the Model ID will require re-loading."
              : "Edit model details. Changing URLs will require re-downloading the model."
            : isWeb
              ? "Add MLC-compiled models for web-llm. Enter the model ID from the web-llm model list."
              : isDesktop
                ? modelCategory === "stt"
                  ? "Add GGUF speech-to-text models from HuggingFace."
                  : "Add GGUF models from HuggingFace. Paste the direct file URL."
                : modelCategory === "stt"
                  ? "Add ExecuTorch (.pte) speech-to-text models from HuggingFace."
                  : "Add ExecuTorch (.pte) models from HuggingFace. Paste the direct file URLs."}
        </Text>
      </View>

      {/* Display Name */}
      <FormField label="Display Name">
        <Input
          placeholder="e.g., Mistral 7B Instruct"
          value={displayName}
          onChangeText={setDisplayName}
        />
      </FormField>

      {/* Model identifier field — varies by platform */}
      {isWeb ? (
        <FormField label="MLC Model ID" marginBottom={false}>
          <Input
            placeholder="e.g., Llama-3.2-3B-Instruct-q4f16_1-MLC"
            value={pteUrl}
            onChangeText={setPteUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </FormField>
      ) : (
        <>
          {/* Model File URL */}
          <FormField
            label={
              isDesktop ? "Model File URL (.gguf)" : "Model File URL (.pte)"
            }
          >
            <Input
              placeholder={
                isDesktop
                  ? "https://huggingface.co/.../model.gguf"
                  : "https://huggingface.co/.../model.pte"
              }
              value={pteUrl}
              onChangeText={setPteUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </FormField>

          {/* Tokenizer fields — only for mobile (desktop GGUF doesn't need separate tokenizer) */}
          {!isDesktop && (
            <>
              <FormField label="Tokenizer File URL (optional)">
                <Input
                  placeholder="https://huggingface.co/.../tokenizer.json"
                  value={tokenizerUrl}
                  onChangeText={setTokenizerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </FormField>

              <FormField
                label="Tokenizer Config URL (optional)"
                marginBottom={false}
              >
                <Input
                  placeholder="https://huggingface.co/.../tokenizer_config.json"
                  value={tokenizerConfigUrl}
                  onChangeText={setTokenizerConfigUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </FormField>
            </>
          )}
        </>
      )}

      {/* Privacy note */}
      <View style={styles.privacyNote}>
        <Ionicons
          name="shield-checkmark-outline"
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
          Models run entirely on your device. No data is sent to external
          servers.
        </Text>
      </View>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacingPatterns.md,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.md,
    padding: spacingPatterns.sm,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: borderRadius.sm,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});
