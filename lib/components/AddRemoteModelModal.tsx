/**
 * Add Remote Model Modal
 *
 * Modal for adding remote API models (OpenAI, Anthropic, Groq, custom).
 * Allows users to select a provider preset and configure API settings.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { storeApiKey } from "../ai/apiKeyStorage";
import {
  PROVIDER_PRESETS,
  type ProviderId,
  type ProviderPreset,
  type ProviderModelPreset,
} from "../ai/customModels";
import {
  generateRemoteModelId,
  generateApiKeyRef,
} from "../ai/modelTypeGuards";
import { useCustomModels } from "../db/useCustomModels";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { RemoteModelPrivacyBanner } from "./RemoteModelPrivacyBanner";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

export interface AddRemoteModelModalProps {
  visible: boolean;
  onClose: () => void;
  onModelAdded?: (modelId: string) => void;
}

type Step = "provider" | "model" | "apiKey" | "privacy";

export function AddRemoteModelModal({
  visible,
  onClose,
  onModelAdded,
}: AddRemoteModelModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { showToast } = useToast();
  const customModels = useCustomModels();

  // Form state
  const [step, setStep] = useState<Step>("provider");
  const [selectedProvider, setSelectedProvider] =
    useState<ProviderPreset | null>(null);
  const [selectedModel, setSelectedModel] =
    useState<ProviderModelPreset | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialogBackground = seasonalTheme.gradient.middle;

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setStep("provider");
    setSelectedProvider(null);
    setSelectedModel(null);
    setApiKey("");
    setCustomBaseUrl("");
    setCustomModelName("");
    setDisplayName("");
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  // Handle provider selection
  const handleSelectProvider = useCallback((provider: ProviderPreset) => {
    setSelectedProvider(provider);
    if (provider.providerId === "custom") {
      // Custom provider goes directly to API key step
      setStep("apiKey");
    } else {
      setStep("model");
    }
  }, []);

  // Handle model selection
  const handleSelectModel = useCallback((model: ProviderModelPreset) => {
    setSelectedModel(model);
    setDisplayName(model.displayName);
    setStep("apiKey");
  }, []);

  // Handle API key submission
  const handleApiKeySubmit = useCallback(() => {
    if (!apiKey.trim()) {
      showToast("Please enter an API key", "error");
      return;
    }

    if (selectedProvider?.providerId === "custom") {
      if (!customBaseUrl.trim()) {
        showToast("Please enter a base URL", "error");
        return;
      }
      if (!customModelName.trim()) {
        showToast("Please enter a model name", "error");
        return;
      }
    }

    setStep("privacy");
  }, [apiKey, selectedProvider, customBaseUrl, customModelName, showToast]);

  // Handle privacy acknowledgment and final submission
  const handlePrivacyAcknowledge = useCallback(async () => {
    if (!selectedProvider) return;

    setIsSubmitting(true);

    try {
      const providerId = selectedProvider.providerId;
      const baseUrl =
        providerId === "custom" ? customBaseUrl : selectedProvider.baseUrl;
      const modelName =
        providerId === "custom"
          ? customModelName
          : selectedModel?.modelName || "";
      const finalDisplayName =
        displayName || selectedModel?.displayName || customModelName;

      // Generate model ID and API key reference
      const modelId = generateRemoteModelId(providerId, modelName);
      const apiKeyRef = generateApiKeyRef(modelId);

      // Store API key in secure storage
      await storeApiKey(apiKeyRef, apiKey.trim());

      // Create remote model in database
      const createdModel = await customModels.createRemoteModel({
        displayName: finalDisplayName,
        description: selectedModel?.description,
        providerId: providerId as ProviderId,
        baseUrl,
        modelName,
        maxTokens: selectedModel?.maxTokens,
        temperature: 0.7,
      });

      // Mark privacy as acknowledged
      await customModels.acknowledgePrivacy(createdModel.modelId);

      showToast(`${finalDisplayName} added successfully`, "success");
      onModelAdded?.(createdModel.modelId);
      handleClose();
    } catch (error) {
      const err = error as { message?: string };
      showToast(err?.message || "Failed to add model", "error");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedProvider,
    selectedModel,
    apiKey,
    customBaseUrl,
    customModelName,
    displayName,
    customModels,
    showToast,
    onModelAdded,
    handleClose,
  ]);

  // Get step title
  const stepTitle = useMemo(() => {
    switch (step) {
      case "provider":
        return "Select Provider";
      case "model":
        return `Select ${selectedProvider?.displayName} Model`;
      case "apiKey":
        return "Enter API Key";
      case "privacy":
        return "Privacy Notice";
    }
  }, [step, selectedProvider]);

  // Can go back?
  const canGoBack = step !== "provider";

  const handleBack = useCallback(() => {
    switch (step) {
      case "model":
        setStep("provider");
        setSelectedProvider(null);
        break;
      case "apiKey":
        if (selectedProvider?.providerId === "custom") {
          setStep("provider");
          setSelectedProvider(null);
        } else {
          setStep("model");
          setSelectedModel(null);
        }
        break;
      case "privacy":
        setStep("apiKey");
        break;
    }
  }, [step, selectedProvider]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoid}
        >
          <View
            style={[styles.container, { backgroundColor: dialogBackground }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Header */}
            <View style={styles.header}>
              {canGoBack && (
                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.backButton}
                >
                  <Ionicons
                    name="arrow-back"
                    size={24}
                    color={seasonalTheme.textSecondary}
                  />
                </TouchableOpacity>
              )}
              <Text
                variant="body"
                style={[
                  styles.title,
                  { color: seasonalTheme.textPrimary, flex: 1 },
                ]}
              >
                {stepTitle}
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={seasonalTheme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1: Provider Selection */}
              {step === "provider" && (
                <View style={styles.stepContent}>
                  <Text
                    variant="caption"
                    style={{
                      color: seasonalTheme.textSecondary,
                      marginBottom: spacingPatterns.sm,
                    }}
                  >
                    Choose an AI provider to connect to.
                  </Text>
                  {PROVIDER_PRESETS.map((provider) => (
                    <TouchableOpacity
                      key={provider.providerId}
                      style={[
                        styles.optionCard,
                        {
                          backgroundColor: seasonalTheme.cardBg,
                          borderColor: `${theme.colors.border}40`,
                        },
                      ]}
                      onPress={() => handleSelectProvider(provider)}
                    >
                      <View style={styles.optionContent}>
                        <View style={styles.optionHeader}>
                          <Ionicons
                            name={
                              provider.providerId === "custom"
                                ? "server-outline"
                                : "cloud-outline"
                            }
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
                            {provider.displayName}
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{ color: seasonalTheme.textSecondary }}
                        >
                          {provider.description}
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

              {/* Step 2: Model Selection */}
              {step === "model" && selectedProvider && (
                <View style={styles.stepContent}>
                  <Text
                    variant="caption"
                    style={{
                      color: seasonalTheme.textSecondary,
                      marginBottom: spacingPatterns.sm,
                    }}
                  >
                    Choose a model from {selectedProvider.displayName}.
                  </Text>
                  {selectedProvider.models.map((model) => (
                    <TouchableOpacity
                      key={model.modelName}
                      style={[
                        styles.optionCard,
                        {
                          backgroundColor: seasonalTheme.cardBg,
                          borderColor: `${theme.colors.border}40`,
                        },
                      ]}
                      onPress={() => handleSelectModel(model)}
                    >
                      <View style={styles.optionContent}>
                        <Text
                          variant="body"
                          style={{
                            color: seasonalTheme.textPrimary,
                            fontWeight: "600",
                          }}
                        >
                          {model.displayName}
                        </Text>
                        <Text
                          variant="caption"
                          style={{ color: seasonalTheme.textSecondary }}
                        >
                          {model.description}
                        </Text>
                        {model.maxTokens && (
                          <Text
                            variant="caption"
                            style={{
                              color: seasonalTheme.textSecondary,
                              fontSize: 10,
                            }}
                          >
                            Max tokens: {model.maxTokens.toLocaleString()}
                          </Text>
                        )}
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

              {/* Step 3: API Key */}
              {step === "apiKey" && (
                <View style={styles.stepContent}>
                  {selectedProvider?.providerId === "custom" && (
                    <>
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          marginBottom: spacingPatterns.xs,
                        }}
                      >
                        Base URL
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
                        placeholder="https://api.example.com/v1"
                        placeholderTextColor={seasonalTheme.textSecondary}
                        value={customBaseUrl}
                        onChangeText={setCustomBaseUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          marginTop: spacingPatterns.sm,
                          marginBottom: spacingPatterns.xs,
                        }}
                      >
                        Model Name
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
                        placeholder="llama-3.2-8b"
                        placeholderTextColor={seasonalTheme.textSecondary}
                        value={customModelName}
                        onChangeText={setCustomModelName}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          marginTop: spacingPatterns.sm,
                          marginBottom: spacingPatterns.xs,
                        }}
                      >
                        Display Name (optional)
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
                        placeholder="My Custom Model"
                        placeholderTextColor={seasonalTheme.textSecondary}
                        value={displayName}
                        onChangeText={setDisplayName}
                      />
                    </>
                  )}

                  <Text
                    variant="caption"
                    style={{
                      color: seasonalTheme.textSecondary,
                      marginTop:
                        selectedProvider?.providerId === "custom"
                          ? spacingPatterns.sm
                          : 0,
                      marginBottom: spacingPatterns.xs,
                    }}
                  >
                    API Key
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
                    placeholder={
                      selectedProvider?.providerId === "openai"
                        ? "sk-..."
                        : selectedProvider?.providerId === "anthropic"
                          ? "sk-ant-..."
                          : "Enter your API key"
                    }
                    placeholderTextColor={seasonalTheme.textSecondary}
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

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
                      Your API key is stored securely in your device's keychain
                      and never sent to our servers.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.continueButton,
                      { backgroundColor: theme.colors.accent },
                    ]}
                    onPress={handleApiKeySubmit}
                  >
                    <Text
                      variant="body"
                      style={{ color: "white", fontWeight: "600" }}
                    >
                      Continue
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color="white" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Step 4: Privacy Acknowledgment */}
              {step === "privacy" && selectedProvider && (
                <View style={styles.stepContent}>
                  <RemoteModelPrivacyBanner
                    providerName={selectedProvider.displayName}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  keyboardAvoid: {
    width: "100%",
    alignItems: "center",
  },
  container: {
    width: "90%",
    maxWidth: 450,
    maxHeight: "80%",
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.md,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.sm,
  },
  backButton: {
    marginRight: spacingPatterns.xs,
    padding: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: 2,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacingPatterns.md,
  },
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
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    fontSize: 14,
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
    borderRadius: borderRadius.sm,
    marginTop: spacingPatterns.md,
  },
});
