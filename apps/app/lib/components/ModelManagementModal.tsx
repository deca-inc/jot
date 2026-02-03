import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import {
  LlmModelConfig,
  ALL_LLM_MODELS,
  SpeechToTextModelConfig,
} from "../ai/modelConfig";
import {
  ensureModelPresent,
  deleteModel,
  getModelSize,
  ensureSTTModelPresent,
  deleteSTTModel,
  getSTTModelSize,
  ensureCustomModelPresent,
  deleteCustomModel,
} from "../ai/modelManager";
import { ALL_STT_MODELS } from "../ai/sttConfig";
import { useUnifiedModel } from "../ai/UnifiedModelProvider";
import {
  usePlatformModels,
  type PlatformLlmConfig,
  type PlatformSttConfig,
} from "../ai/usePlatformModels";
import { type Agent, type ThinkMode, useAgents } from "../db/agents";
import { useModelSettings } from "../db/modelSettings";
import { useCustomModels } from "../db/useCustomModels";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { getDeviceTier, getCompatibleModels } from "../utils/deviceInfo";
import { AddCustomLocalModelModal } from "./AddCustomLocalModelModal";
import { AddRemoteModelModal } from "./AddRemoteModelModal";
import { ModelCard } from "./ModelCard";
import { PersonaEditor } from "./PersonaEditor";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";
import type {
  CustomLocalModelConfig,
  CustomModelConfig,
  RemoteModelConfig,
} from "../ai/customModels";

export type ModelManagementTab = "llms" | "voice" | "agents";

export interface ModelManagementModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: ModelManagementTab;
}

// Estimated file sizes in MB
const MODEL_SIZES: Record<string, number> = {
  // LLM models
  "llama-3.2-1b-instruct": 1083,
  "llama-3.2-3b-instruct": 2435,
  "qwen-3-0.6b": 900,
  "qwen-3-1.7b": 2064,
  "qwen-3-4b": 3527,
  "smollm2-135m": 535,
  "smollm2-360m": 1360,
  "smollm2-1.7b": 1220,
  // STT models
  "whisper-tiny-en": 233,
  "whisper-tiny-multi": 233,
};

const formatSize = (mb: number) => {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

// Model order for display
const LLM_ORDER = [
  "llama-3.2-1b-instruct",
  "llama-3.2-3b-instruct",
  "qwen-3-0.6b",
  "qwen-3-1.7b",
  "qwen-3-4b",
  "smollm2-135m",
  "smollm2-360m",
  "smollm2-1.7b",
];

const STT_ORDER = ["whisper-tiny-en", "whisper-tiny-multi"];

export function ModelManagementModal({
  visible,
  onClose,
  initialTab = "llms",
}: ModelManagementModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const modelSettings = useModelSettings();
  const { reloadModel } = useUnifiedModel();
  const agentsRepo = useAgents();
  const { showToast } = useToast();
  const {
    platformLLMs,
    platformSTTs,
    hasPlatformLLM,
    hasPlatformSTT,
    isLoading: _platformModelsLoading,
  } = usePlatformModels();
  const customModelsRepo = useCustomModels();

  const [activeTab, setActiveTab] = useState<ModelManagementTab>(initialTab);

  // LLM state
  const [selectedLLMId, setSelectedLLMId] = useState<string | null>(null);
  const [downloadedLLMs, setDownloadedLLMs] = useState<string[]>([]);
  const [compatibleModels, setCompatibleModels] = useState<string[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(
    new Set(),
  );
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(
    new Map(),
  );
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [_deviceTier, setDeviceTier] = useState<string>("mid");

  // STT state
  const [selectedSTTId, setSelectedSTTId] = useState<string | null>(null);
  const [downloadedSTTs, setDownloadedSTTs] = useState<string[]>([]);

  // Platform model state
  const [selectedPlatformLLMId, setSelectedPlatformLLMId] = useState<
    string | null
  >(null);
  const [selectedPlatformSTTId, setSelectedPlatformSTTId] = useState<
    string | null
  >(null);

  // Agents state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAgentEditor, setShowAgentEditor] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);

  // Remote models state (LLM)
  const [remoteModels, setRemoteModels] = useState<CustomModelConfig[]>([]);
  const [showAddRemoteModal, setShowAddRemoteModal] = useState(false);
  const [editingRemoteModel, setEditingRemoteModel] =
    useState<CustomModelConfig | null>(null);

  // Remote STT models state
  const [remoteSttModels, setRemoteSttModels] = useState<CustomModelConfig[]>(
    [],
  );
  const [showAddRemoteSttModal, setShowAddRemoteSttModal] = useState(false);
  const [editingRemoteSttModel, setEditingRemoteSttModel] =
    useState<CustomModelConfig | null>(null);

  // Custom local models state (LLM)
  const [customLocalModels, setCustomLocalModels] = useState<
    CustomModelConfig[]
  >([]);
  const [showAddCustomLocalModal, setShowAddCustomLocalModal] = useState(false);
  const [editingCustomLocalModel, setEditingCustomLocalModel] =
    useState<CustomLocalModelConfig | null>(null);

  // Custom local STT models state
  const [customLocalSttModels, setCustomLocalSttModels] = useState<
    CustomModelConfig[]
  >([]);
  const [showAddCustomLocalSttModal, setShowAddCustomLocalSttModal] =
    useState(false);
  const [editingCustomLocalSttModel, setEditingCustomLocalSttModel] =
    useState<CustomLocalModelConfig | null>(null);

  const [loading, setLoading] = useState(true);

  // Load settings when modal opens
  useEffect(() => {
    if (visible) {
      loadSettings();
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [
        selectedLlmId,
        selectedSttId,
        downloaded,
        compatible,
        tier,
        agentsList,
        remoteModelsList,
        remoteSttModelsList,
        customLocalLlmModelsList,
        customLocalSttModelsList,
      ] = await Promise.all([
        modelSettings.getSelectedModelId(),
        modelSettings.getSelectedSttModelId(),
        modelSettings.getDownloadedModels(),
        getCompatibleModels(),
        getDeviceTier(),
        agentsRepo.getAll(),
        customModelsRepo.getRemoteModelsByCategory("llm"),
        customModelsRepo.getRemoteModelsByCategory("stt"),
        customModelsRepo.getCustomLocalModelsByCategory("llm"),
        customModelsRepo.getCustomLocalModelsByCategory("stt"),
      ]);

      setSelectedLLMId(selectedLlmId);
      setSelectedSTTId(selectedSttId);
      setCompatibleModels(compatible);
      setDeviceTier(tier);
      setAgents(agentsList);
      setRemoteModels(remoteModelsList);
      setRemoteSttModels(remoteSttModelsList);
      setCustomLocalModels(customLocalLlmModelsList);
      setCustomLocalSttModels(customLocalSttModelsList);

      // Separate LLM and STT models
      const llmIds = downloaded
        .filter((m) => !m.modelType || m.modelType === "llm")
        .map((m) => m.modelId);
      const sttIds = downloaded
        .filter((m) => m.modelType === "speech-to-text")
        .map((m) => m.modelId);

      setDownloadedLLMs(llmIds);
      setDownloadedSTTs(sttIds);
    } catch (error) {
      console.error("Failed to load model settings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Sort models by predefined order
  const sortedLLMs = [...ALL_LLM_MODELS].sort((a, b) => {
    const indexA = LLM_ORDER.indexOf(a.modelId);
    const indexB = LLM_ORDER.indexOf(b.modelId);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  const sortedSTTs = [...ALL_STT_MODELS].sort((a, b) => {
    const indexA = STT_ORDER.indexOf(a.modelId);
    const indexB = STT_ORDER.indexOf(b.modelId);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // LLM handlers
  const handleDownloadLLM = useCallback(
    async (model: LlmModelConfig) => {
      if (!model.available) {
        Alert.alert(
          "Model Not Available",
          "This model does not have ExecuTorch PTE files available yet.",
        );
        return;
      }

      setDownloadingModels((prev) => new Set(prev).add(model.modelId));
      setDownloadProgress((prev) => new Map(prev).set(model.modelId, 0));

      try {
        const progressInterval = setInterval(() => {
          setDownloadProgress((prev) => {
            const current = prev.get(model.modelId) || 0;
            if (current >= 95) {
              clearInterval(progressInterval);
              return prev;
            }
            const next = new Map(prev);
            next.set(model.modelId, Math.min(95, current + Math.random() * 10));
            return next;
          });
        }, 500);

        const result = await ensureModelPresent(model);
        clearInterval(progressInterval);
        setDownloadProgress((prev) => new Map(prev).set(model.modelId, 100));

        const size = await getModelSize(model);

        await modelSettings.addDownloadedModel({
          modelId: model.modelId,
          modelType: "llm",
          downloadedAt: Date.now(),
          ptePath: result.ptePath,
          tokenizerPath: result.tokenizerPath,
          tokenizerConfigPath: result.tokenizerConfigPath,
          size,
        });

        showToast(`${model.displayName} downloaded successfully`, "success");
        await loadSettings();
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(err?.message || "Failed to download model", "error");
      } finally {
        setDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(model.modelId);
          return next;
        });
      }
    },
    [modelSettings, showToast],
  );

  const handleSelectLLM = useCallback(
    async (model: LlmModelConfig) => {
      try {
        setLoadingModelId(model.modelId);
        await reloadModel(model);
        setSelectedLLMId(model.modelId);
        showToast(`${model.displayName} is now active`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to load: ${err?.message || "Unknown error"}`,
          "error",
        );
      } finally {
        setLoadingModelId(null);
      }
    },
    [reloadModel, showToast],
  );

  // Platform LLM handlers
  const handleSelectPlatformLLM = useCallback(
    async (model: PlatformLlmConfig) => {
      try {
        // For platform models, we just store the selection
        // The actual model loading happens through native APIs
        await modelSettings.setSelectedModelId(model.modelId);
        setSelectedPlatformLLMId(model.modelId);
        setSelectedLLMId(null); // Deselect any downloadable model
        showToast(`${model.displayName} is now active`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to select: ${err?.message || "Unknown error"}`,
          "error",
        );
      }
    },
    [modelSettings, showToast],
  );

  // Platform STT handlers
  const handleSelectPlatformSTT = useCallback(
    async (model: PlatformSttConfig) => {
      try {
        await modelSettings.setSelectedSttModelId(model.modelId);
        setSelectedPlatformSTTId(model.modelId);
        setSelectedSTTId(null); // Deselect any downloadable model
        showToast(`${model.displayName} selected`, "success");
      } catch (_error) {
        showToast("Failed to select voice model", "error");
      }
    },
    [modelSettings, showToast],
  );

  const handleRemoveLLM = useCallback(
    async (model: LlmModelConfig) => {
      // Check if any agents are using this model
      const agentsUsingModel = await agentsRepo.getByModelId(model.modelId);

      if (agentsUsingModel.length > 0) {
        const agentNames = agentsUsingModel.map((a) => a.name).join(", ");
        Alert.alert(
          "Cannot Remove Model",
          `This model is being used by the following persona(s): ${agentNames}.\n\nUpdate or delete these personas first.`,
          [{ text: "OK", style: "default" }],
        );
        return;
      }

      const isCurrentlySelected = selectedLLMId === model.modelId;

      Alert.alert(
        "Remove Model",
        `Are you sure you want to remove ${model.displayName}?${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model to use AI chat." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedModelId("");
                  setSelectedLLMId(null);
                }
                await deleteModel(model);
                await modelSettings.removeDownloadedModel(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [modelSettings, showToast, agentsRepo, selectedLLMId],
  );

  // Remote model handlers
  const handleSelectRemoteModel = useCallback(
    async (model: CustomModelConfig) => {
      try {
        setLoadingModelId(model.modelId);
        await modelSettings.setSelectedModelId(model.modelId);
        setSelectedLLMId(model.modelId);
        setSelectedPlatformLLMId(null);
        showToast(`${model.displayName} is now active`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to select: ${err?.message || "Unknown error"}`,
          "error",
        );
      } finally {
        setLoadingModelId(null);
      }
    },
    [modelSettings, showToast],
  );

  const handleRemoveRemoteModel = useCallback(
    (model: CustomModelConfig) => {
      const isCurrentlySelected = selectedLLMId === model.modelId;

      Alert.alert(
        "Remove Remote Model",
        `Are you sure you want to remove ${model.displayName}? This will also delete the stored API key.${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model to use AI chat." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedModelId("");
                  setSelectedLLMId(null);
                }
                await customModelsRepo.delete(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [customModelsRepo, showToast, selectedLLMId, modelSettings],
  );

  const handleRemoteModelAdded = useCallback(async () => {
    await loadSettings();
    setEditingRemoteModel(null);
  }, []);

  const handleEditRemoteModel = useCallback((model: CustomModelConfig) => {
    setEditingRemoteModel(model);
    setShowAddRemoteModal(true);
  }, []);

  // Remote STT model handlers
  const handleSelectRemoteSttModel = useCallback(
    async (model: CustomModelConfig) => {
      try {
        setLoadingModelId(model.modelId);
        await modelSettings.setSelectedSttModelId(model.modelId);
        setSelectedSTTId(model.modelId);
        setSelectedPlatformSTTId(null);
        showToast(`${model.displayName} is now active for voice`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to select: ${err?.message || "Unknown error"}`,
          "error",
        );
      } finally {
        setLoadingModelId(null);
      }
    },
    [modelSettings, showToast],
  );

  const handleRemoveRemoteSttModel = useCallback(
    (model: CustomModelConfig) => {
      const isCurrentlySelected = selectedSTTId === model.modelId;

      Alert.alert(
        "Remove Remote Voice Model",
        `Are you sure you want to remove ${model.displayName}? This will also delete the stored API key.${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model for voice input." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedSttModelId("");
                  setSelectedSTTId(null);
                }
                await customModelsRepo.delete(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [customModelsRepo, showToast, selectedSTTId, modelSettings],
  );

  const handleRemoteSttModelAdded = useCallback(async () => {
    await loadSettings();
    setEditingRemoteSttModel(null);
  }, []);

  const handleEditRemoteSttModel = useCallback((model: CustomModelConfig) => {
    setEditingRemoteSttModel(model);
    setShowAddRemoteSttModal(true);
  }, []);

  // Custom local model handlers
  const handleSelectCustomLocalModel = useCallback(
    async (model: CustomModelConfig) => {
      try {
        setLoadingModelId(model.modelId);
        await modelSettings.setSelectedModelId(model.modelId);
        setSelectedLLMId(model.modelId);
        setSelectedPlatformLLMId(null);
        showToast(`${model.displayName} is now active`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to select: ${err?.message || "Unknown error"}`,
          "error",
        );
      } finally {
        setLoadingModelId(null);
      }
    },
    [modelSettings, showToast],
  );

  const handleCustomLocalModelAdded = useCallback(async () => {
    await loadSettings();
    setEditingCustomLocalModel(null);
  }, []);

  const handleEditCustomLocalModel = useCallback(
    (model: CustomLocalModelConfig) => {
      setEditingCustomLocalModel(model);
      setShowAddCustomLocalModal(true);
    },
    [],
  );

  // Download handler for custom local models
  const handleDownloadCustomLocalModel = useCallback(
    async (model: CustomLocalModelConfig) => {
      if (!model.huggingFaceUrl) {
        showToast("Model URL not configured", "error");
        return;
      }

      // Debug: log the URL being used for download
      console.log(
        `[handleDownloadCustomLocalModel] Downloading with URL: ${model.huggingFaceUrl}`,
      );
      console.log(`[handleDownloadCustomLocalModel] Model config:`, {
        modelId: model.modelId,
        folderName: model.folderName,
        pteFileName: model.pteFileName,
        tokenizerUrl: model.tokenizerUrl,
        tokenizerFileName: model.tokenizerFileName,
      });

      setDownloadingModels((prev) => new Set(prev).add(model.modelId));
      setDownloadProgress((prev) => new Map(prev).set(model.modelId, 0));

      try {
        await ensureCustomModelPresent(
          {
            modelId: model.modelId,
            displayName: model.displayName,
            folderName: model.folderName,
            pteFileName: model.pteFileName,
            pteUrl: model.huggingFaceUrl,
            tokenizerUrl: model.tokenizerUrl,
            tokenizerFileName: model.tokenizerFileName,
            tokenizerConfigUrl: model.tokenizerConfigUrl,
            tokenizerConfigFileName: model.tokenizerConfigFileName,
          },
          (progress) => {
            setDownloadProgress((prev) =>
              new Map(prev).set(
                model.modelId,
                Math.min(100, Math.round(progress * 100)),
              ),
            );
          },
        );

        // Mark as downloaded in database
        await customModelsRepo.setDownloaded(model.modelId, true);

        showToast(`${model.displayName} downloaded successfully`, "success");
        await loadSettings();
      } catch (error) {
        const err = error as { message?: string };
        const message = err?.message || "Download failed";
        // Make error messages more user-friendly
        if (message.includes("404")) {
          showToast(
            "Download failed: File not found (404). Check the URL.",
            "error",
          );
        } else if (message.includes("403")) {
          showToast(
            "Download failed: Access denied (403). File may be private.",
            "error",
          );
        } else {
          showToast(message, "error");
        }
      } finally {
        setDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(model.modelId);
          return next;
        });
      }
    },
    [customModelsRepo, showToast],
  );

  // Remove handler for custom local models (now also deletes files)
  const handleRemoveCustomLocalModelWithFiles = useCallback(
    (model: CustomLocalModelConfig) => {
      const isCurrentlySelected = selectedLLMId === model.modelId;

      Alert.alert(
        "Remove Custom Model",
        `Are you sure you want to remove ${model.displayName}? This will delete the downloaded files.${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model to use AI chat." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedModelId("");
                  setSelectedLLMId(null);
                }
                // Delete downloaded files
                if (model.isDownloaded) {
                  await deleteCustomModel(model.folderName);
                }
                // Delete from database
                await customModelsRepo.delete(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [customModelsRepo, showToast, selectedLLMId, modelSettings],
  );

  // Custom local STT model handlers
  const handleSelectCustomLocalSttModel = useCallback(
    async (model: CustomModelConfig) => {
      try {
        await modelSettings.setSelectedSttModelId(model.modelId);
        setSelectedSTTId(model.modelId);
        setSelectedPlatformSTTId(null);
        showToast(`${model.displayName} selected`, "success");
      } catch (_error) {
        showToast("Failed to select voice model", "error");
      }
    },
    [modelSettings, showToast],
  );

  // Remove handler for custom local STT models (with file deletion)
  const handleRemoveCustomLocalSttModelWithFiles = useCallback(
    (model: CustomLocalModelConfig) => {
      const isCurrentlySelected = selectedSTTId === model.modelId;

      Alert.alert(
        "Remove Custom Voice Model",
        `Are you sure you want to remove ${model.displayName}? This will delete the downloaded files.${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model to use voice input." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedSttModelId("");
                  setSelectedSTTId(null);
                }
                // Delete downloaded files
                if (model.isDownloaded) {
                  await deleteCustomModel(model.folderName);
                }
                // Delete from database
                await customModelsRepo.delete(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [customModelsRepo, showToast, selectedSTTId, modelSettings],
  );

  // Download handler for custom local STT models (reuses same logic as LLM)
  const handleDownloadCustomLocalSttModel = useCallback(
    async (model: CustomLocalModelConfig) => {
      if (!model.huggingFaceUrl) {
        showToast("Model URL not configured", "error");
        return;
      }

      // Debug: log the URL being used for download
      console.log(
        `[handleDownloadCustomLocalSttModel] Downloading with URL: ${model.huggingFaceUrl}`,
      );
      console.log(`[handleDownloadCustomLocalSttModel] Model config:`, {
        modelId: model.modelId,
        folderName: model.folderName,
        pteFileName: model.pteFileName,
        tokenizerUrl: model.tokenizerUrl,
        tokenizerFileName: model.tokenizerFileName,
      });

      setDownloadingModels((prev) => new Set(prev).add(model.modelId));
      setDownloadProgress((prev) => new Map(prev).set(model.modelId, 0));

      try {
        await ensureCustomModelPresent(
          {
            modelId: model.modelId,
            displayName: model.displayName,
            folderName: model.folderName,
            pteFileName: model.pteFileName,
            pteUrl: model.huggingFaceUrl,
            tokenizerUrl: model.tokenizerUrl,
            tokenizerFileName: model.tokenizerFileName,
            tokenizerConfigUrl: model.tokenizerConfigUrl,
            tokenizerConfigFileName: model.tokenizerConfigFileName,
          },
          (progress) => {
            setDownloadProgress((prev) =>
              new Map(prev).set(
                model.modelId,
                Math.min(100, Math.round(progress * 100)),
              ),
            );
          },
        );

        // Mark as downloaded in database
        await customModelsRepo.setDownloaded(model.modelId, true);

        showToast(`${model.displayName} downloaded successfully`, "success");
        await loadSettings();
      } catch (error) {
        const err = error as { message?: string };
        const message = err?.message || "Download failed";
        // Make error messages more user-friendly
        if (message.includes("404")) {
          showToast(
            "Download failed: File not found (404). Check the URL.",
            "error",
          );
        } else if (message.includes("403")) {
          showToast(
            "Download failed: Access denied (403). File may be private.",
            "error",
          );
        } else {
          showToast(message, "error");
        }
      } finally {
        setDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(model.modelId);
          return next;
        });
      }
    },
    [customModelsRepo, showToast],
  );

  const handleCustomLocalSttModelAdded = useCallback(async () => {
    await loadSettings();
    setEditingCustomLocalSttModel(null);
  }, []);

  const handleEditCustomLocalSttModel = useCallback(
    (model: CustomLocalModelConfig) => {
      setEditingCustomLocalSttModel(model);
      setShowAddCustomLocalSttModal(true);
    },
    [],
  );

  // STT handlers (similar to LLM)
  const handleDownloadSTT = useCallback(
    async (model: SpeechToTextModelConfig) => {
      if (!model.available) {
        Alert.alert("Model Not Available", "This model is not yet available.");
        return;
      }

      setDownloadingModels((prev) => new Set(prev).add(model.modelId));
      setDownloadProgress((prev) => new Map(prev).set(model.modelId, 0));

      try {
        const result = await ensureSTTModelPresent(model, (progress) => {
          setDownloadProgress((prev) =>
            new Map(prev).set(
              model.modelId,
              Math.min(100, Math.round(progress * 100)),
            ),
          );
        });

        const size = await getSTTModelSize(model);

        await modelSettings.addDownloadedModel({
          modelId: model.modelId,
          modelType: "speech-to-text",
          downloadedAt: Date.now(),
          ptePath: result.encoderPath, // Store encoder path as main path
          tokenizerPath: result.tokenizerPath,
          size,
        });

        showToast(`${model.displayName} downloaded successfully`, "success");
        await loadSettings();
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(err?.message || "Failed to download voice model", "error");
      } finally {
        setDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(model.modelId);
          return next;
        });
      }
    },
    [modelSettings, showToast],
  );

  const handleSelectSTT = useCallback(
    async (model: SpeechToTextModelConfig) => {
      try {
        await modelSettings.setSelectedSttModelId(model.modelId);
        setSelectedSTTId(model.modelId);
        showToast(`${model.displayName} selected`, "success");
      } catch (_error) {
        showToast("Failed to select voice model", "error");
      }
    },
    [modelSettings, showToast],
  );

  const handleRemoveSTT = useCallback(
    (model: SpeechToTextModelConfig) => {
      const isCurrentlySelected = selectedSTTId === model.modelId;

      Alert.alert(
        "Remove Model",
        `Are you sure you want to remove ${model.displayName}?${isCurrentlySelected ? "\n\nThis model is currently selected. You will need to select another model to use voice input." : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                // Deselect if currently selected
                if (isCurrentlySelected) {
                  await modelSettings.setSelectedSttModelId("");
                  setSelectedSTTId(null);
                }
                await deleteSTTModel(model);
                await modelSettings.removeDownloadedModel(model.modelId);
                showToast(`${model.displayName} removed`, "success");
                await loadSettings();
              } catch (_error) {
                showToast("Failed to remove model", "error");
              }
            },
          },
        ],
      );
    },
    [modelSettings, showToast, selectedSTTId],
  );

  // Agent handlers
  const handleCreateAgent = useCallback(() => {
    setEditingAgent(null);
    setShowAgentEditor(true);
  }, []);

  const handleEditAgent = useCallback((agent: Agent) => {
    setEditingAgent(agent);
    setShowAgentEditor(true);
  }, []);

  const handleSaveAgent = useCallback(
    async (data: {
      name: string;
      systemPrompt: string;
      thinkMode: ThinkMode;
      modelId: string;
    }) => {
      try {
        setSavingAgent(true);
        if (editingAgent) {
          await agentsRepo.update(editingAgent.id, data);
          showToast(`${data.name} updated`, "success");
        } else {
          await agentsRepo.create(data);
          showToast(`${data.name} created`, "success");
        }
        setShowAgentEditor(false);
        setEditingAgent(null);
        // Refresh agents list
        const updatedAgents = await agentsRepo.getAll();
        setAgents(updatedAgents);
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(err?.message || "Failed to save persona", "error");
      } finally {
        setSavingAgent(false);
      }
    },
    [agentsRepo, editingAgent, showToast],
  );

  const handleDeleteAgent = useCallback(
    (agent: Agent) => {
      if (agent.isDefault) {
        showToast("Cannot delete the default persona", "error");
        return;
      }

      Alert.alert(
        "Delete Persona",
        `Are you sure you want to delete "${agent.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await agentsRepo.delete(agent.id);
                showToast(`${agent.name} deleted`, "success");
                const updatedAgents = await agentsRepo.getAll();
                setAgents(updatedAgents);
              } catch (error: unknown) {
                const err = error as { message?: string };
                showToast(err?.message || "Failed to delete persona", "error");
              }
            },
          },
        ],
      );
    },
    [agentsRepo, showToast],
  );

  const handleSetDefaultAgent = useCallback(
    async (agent: Agent) => {
      try {
        await agentsRepo.setDefault(agent.id);
        showToast(`${agent.name} is now the default`, "success");
        const updatedAgents = await agentsRepo.getAll();
        setAgents(updatedAgents);
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(err?.message || "Failed to set default", "error");
      }
    },
    [agentsRepo, showToast],
  );

  const handleCancelAgentEditor = useCallback(() => {
    setShowAgentEditor(false);
    setEditingAgent(null);
  }, []);

  const tabs: { key: ModelManagementTab; label: string; icon: string }[] = [
    { key: "llms", label: "LLMs", icon: "chatbubble-ellipses-outline" },
    { key: "voice", label: "Voice", icon: "mic-outline" },
    { key: "agents", label: "Personas", icon: "person-circle-outline" },
  ];

  const dialogBackground = seasonalTheme.gradient.middle;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: dialogBackground }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text
              variant="body"
              style={[styles.title, { color: seasonalTheme.textPrimary }]}
            >
              Model Manager
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons
                name="close"
                size={24}
                color={seasonalTheme.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Tab Bar */}
          <View
            style={[
              styles.tabBar,
              { borderBottomColor: `${theme.colors.border}30` },
            ]}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tab,
                  activeTab === tab.key && {
                    borderBottomColor: theme.colors.accent,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={
                    activeTab === tab.key
                      ? theme.colors.accent
                      : seasonalTheme.textSecondary
                  }
                />
                <Text
                  variant="caption"
                  style={[
                    styles.tabLabel,
                    {
                      color:
                        activeTab === tab.key
                          ? theme.colors.accent
                          : seasonalTheme.textSecondary,
                      fontWeight: activeTab === tab.key ? "600" : "400",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
            scrollEnabled={true}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  Loading...
                </Text>
              </View>
            ) : (
              <>
                {/* LLMs Tab */}
                {activeTab === "llms" && (
                  <View style={styles.tabContent}>
                    {/* Platform Models Section */}
                    {hasPlatformLLM && (
                      <View style={styles.platformSection}>
                        <View style={styles.platformHeader}>
                          <Ionicons
                            name="hardware-chip-outline"
                            size={14}
                            color={theme.colors.accent}
                          />
                          <Text
                            variant="caption"
                            style={{
                              color: theme.colors.accent,
                              fontWeight: "600",
                            }}
                          >
                            Built-in Models
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            marginBottom: spacingPatterns.sm,
                            fontSize: 11,
                          }}
                        >
                          No download required. Provided by your device.
                        </Text>
                        {platformLLMs.map((model) => (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{ text: "BUILT-IN", variant: "success" }}
                            isSelected={selectedPlatformLLMId === model.modelId}
                            warningText={
                              !model.supportsSystemPrompt
                                ? "Note: Cannot be used with custom personas"
                                : null
                            }
                            canSelect
                            onSelect={() => handleSelectPlatformLLM(model)}
                          />
                        ))}
                      </View>
                    )}

                    {/* Downloadable Models Section */}
                    {hasPlatformLLM && (
                      <View style={styles.downloadableSectionHeader}>
                        <Ionicons
                          name="cloud-download-outline"
                          size={14}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            fontWeight: "600",
                          }}
                        >
                          Downloadable Models
                        </Text>
                      </View>
                    )}

                    {sortedLLMs.map((model) => {
                      const isDownloaded = downloadedLLMs.includes(
                        model.modelId,
                      );
                      const isSelected =
                        selectedLLMId === model.modelId &&
                        !selectedPlatformLLMId;
                      const isNotRecommended = !compatibleModels.includes(
                        model.modelId,
                      );
                      const estimatedSize = MODEL_SIZES[model.modelId] || 0;

                      return (
                        <ModelCard
                          key={model.modelId}
                          displayName={model.displayName}
                          description={model.description}
                          isSelected={isSelected}
                          isDownloading={downloadingModels.has(model.modelId)}
                          isLoading={loadingModelId === model.modelId}
                          downloadProgress={downloadProgress.get(model.modelId)}
                          sizeText={formatSize(estimatedSize)}
                          warningBadge={
                            isNotRecommended && !isDownloaded
                              ? "May crash on this device"
                              : null
                          }
                          canSelect={isDownloaded}
                          canDownload={!isDownloaded && model.available}
                          canRemove={isDownloaded}
                          onSelect={() => {
                            setSelectedPlatformLLMId(null);
                            handleSelectLLM(model);
                          }}
                          onDownload={() => handleDownloadLLM(model)}
                          onRemove={() => handleRemoveLLM(model)}
                        />
                      );
                    })}

                    {/* Custom Local Models Section */}
                    <View style={styles.downloadableSectionHeader}>
                      <Ionicons
                        name="hardware-chip-outline"
                        size={14}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontWeight: "600",
                          flex: 1,
                        }}
                      >
                        Custom Local Models
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.addRemoteButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={() => setShowAddCustomLocalModal(true)}
                      >
                        <Ionicons name="add" size={14} color="white" />
                        <Text
                          variant="caption"
                          style={{
                            color: "white",
                            fontWeight: "600",
                            fontSize: 11,
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {customLocalModels.length === 0 ? (
                      <View
                        style={[
                          styles.noModelsBanner,
                          { backgroundColor: `${theme.colors.border}15` },
                        ]}
                      >
                        <Ionicons
                          name="download-outline"
                          size={16}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            flex: 1,
                          }}
                        >
                          Add custom ExecuTorch (.pte) models from HuggingFace
                          to run on-device.
                        </Text>
                      </View>
                    ) : (
                      customLocalModels.map((model) => {
                        const customModel = model as CustomLocalModelConfig;
                        const isSelected = selectedLLMId === model.modelId;
                        const isDownloading = downloadingModels.has(
                          model.modelId,
                        );
                        const isDownloaded = customModel.isDownloaded;

                        return (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{
                              text: isDownloaded ? "LOCAL" : "NOT DOWNLOADED",
                              variant: isDownloaded ? "success" : "secondary",
                              icon: "hardware-chip-outline",
                            }}
                            isSelected={isSelected}
                            isDownloading={isDownloading}
                            downloadProgress={downloadProgress.get(
                              model.modelId,
                            )}
                            canSelect={isDownloaded}
                            canDownload={!isDownloaded}
                            canEdit
                            canRemove
                            onSelect={() => handleSelectCustomLocalModel(model)}
                            onDownload={() =>
                              handleDownloadCustomLocalModel(customModel)
                            }
                            onEdit={() =>
                              handleEditCustomLocalModel(customModel)
                            }
                            onRemove={() =>
                              handleRemoveCustomLocalModelWithFiles(customModel)
                            }
                          />
                        );
                      })
                    )}

                    {/* Remote API Models Section */}
                    <View style={styles.downloadableSectionHeader}>
                      <Ionicons
                        name="cloud-outline"
                        size={14}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontWeight: "600",
                          flex: 1,
                        }}
                      >
                        Remote API Models
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.addRemoteButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={() => setShowAddRemoteModal(true)}
                      >
                        <Ionicons name="add" size={14} color="white" />
                        <Text
                          variant="caption"
                          style={{
                            color: "white",
                            fontWeight: "600",
                            fontSize: 11,
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {remoteModels.length === 0 ? (
                      <View
                        style={[
                          styles.noModelsBanner,
                          { backgroundColor: `${theme.colors.border}15` },
                        ]}
                      >
                        <Ionicons
                          name="cloud-outline"
                          size={16}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            flex: 1,
                          }}
                        >
                          Add remote API models (OpenAI, Anthropic, Groq) for
                          cloud-based inference.
                        </Text>
                      </View>
                    ) : (
                      remoteModels.map((model) => {
                        const isSelected = selectedLLMId === model.modelId;
                        return (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{
                              text: "REMOTE",
                              variant: "accent",
                              icon: "cloud-outline",
                            }}
                            isSelected={isSelected}
                            canSelect
                            canEdit
                            canRemove
                            onSelect={() => handleSelectRemoteModel(model)}
                            onEdit={() => handleEditRemoteModel(model)}
                            onRemove={() => handleRemoveRemoteModel(model)}
                          />
                        );
                      })
                    )}
                  </View>
                )}

                {/* Voice Tab */}
                {activeTab === "voice" && (
                  <View style={styles.tabContent}>
                    <Text
                      variant="caption"
                      style={[
                        styles.description,
                        { color: seasonalTheme.textSecondary },
                      ]}
                    >
                      Voice models for speech-to-text transcription.
                    </Text>

                    {/* Platform STT Models Section */}
                    {hasPlatformSTT && (
                      <View style={styles.platformSection}>
                        <View style={styles.platformHeader}>
                          <Ionicons
                            name="hardware-chip-outline"
                            size={14}
                            color={theme.colors.accent}
                          />
                          <Text
                            variant="caption"
                            style={{
                              color: theme.colors.accent,
                              fontWeight: "600",
                            }}
                          >
                            Built-in Speech Recognition
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            marginBottom: spacingPatterns.sm,
                            fontSize: 11,
                          }}
                        >
                          No download required. Provided by your device.
                        </Text>
                        {platformSTTs.map((model) => (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{ text: "BUILT-IN", variant: "success" }}
                            isSelected={selectedPlatformSTTId === model.modelId}
                            warningText={
                              Platform.OS === "android"
                                ? "Note: Transcription only. Audio files are not saved with this option."
                                : null
                            }
                            canSelect
                            onSelect={() => handleSelectPlatformSTT(model)}
                          />
                        ))}
                      </View>
                    )}

                    {/* Downloadable Models Section */}
                    {hasPlatformSTT && (
                      <View style={styles.downloadableSectionHeader}>
                        <Ionicons
                          name="cloud-download-outline"
                          size={14}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            fontWeight: "600",
                          }}
                        >
                          Downloadable Models
                        </Text>
                      </View>
                    )}

                    {downloadedSTTs.length === 0 && !hasPlatformSTT && (
                      <View
                        style={[
                          styles.noModelsBanner,
                          { backgroundColor: `${theme.colors.warning}15` },
                        ]}
                      >
                        <Ionicons
                          name="mic-outline"
                          size={16}
                          color={theme.colors.warning}
                        />
                        <Text
                          variant="caption"
                          style={{ color: theme.colors.warning, flex: 1 }}
                        >
                          Download a voice model to enable speech-to-text
                          transcription.
                        </Text>
                      </View>
                    )}
                    {sortedSTTs.map((model) => {
                      const isDownloaded = downloadedSTTs.includes(
                        model.modelId,
                      );
                      const isSelected =
                        selectedSTTId === model.modelId &&
                        !selectedPlatformSTTId;
                      const estimatedSize = MODEL_SIZES[model.modelId] || 0;

                      return (
                        <ModelCard
                          key={model.modelId}
                          displayName={model.displayName}
                          description={model.description}
                          isSelected={isSelected}
                          isDownloading={downloadingModels.has(model.modelId)}
                          downloadProgress={downloadProgress.get(model.modelId)}
                          sizeText={formatSize(estimatedSize)}
                          canSelect={isDownloaded}
                          canDownload={!isDownloaded && model.available}
                          canRemove={isDownloaded}
                          onSelect={() => {
                            setSelectedPlatformSTTId(null);
                            handleSelectSTT(model);
                          }}
                          onDownload={() => handleDownloadSTT(model)}
                          onRemove={() => handleRemoveSTT(model)}
                        />
                      );
                    })}

                    {/* Custom Local Voice Models Section */}
                    <View style={styles.downloadableSectionHeader}>
                      <Ionicons
                        name="hardware-chip-outline"
                        size={14}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontWeight: "600",
                          flex: 1,
                        }}
                      >
                        Custom Local Voice Models
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.addRemoteButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={() => setShowAddCustomLocalSttModal(true)}
                      >
                        <Ionicons name="add" size={14} color="white" />
                        <Text
                          variant="caption"
                          style={{
                            color: "white",
                            fontWeight: "600",
                            fontSize: 11,
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {customLocalSttModels.length === 0 ? (
                      <View
                        style={[
                          styles.noModelsBanner,
                          { backgroundColor: `${theme.colors.border}15` },
                        ]}
                      >
                        <Ionicons
                          name="download-outline"
                          size={16}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            flex: 1,
                          }}
                        >
                          Add custom ExecuTorch (.pte) speech-to-text models
                          from HuggingFace to run on-device.
                        </Text>
                      </View>
                    ) : (
                      customLocalSttModels.map((model) => {
                        const customModel = model as CustomLocalModelConfig;
                        const isSelected = selectedSTTId === model.modelId;
                        const isDownloading = downloadingModels.has(
                          model.modelId,
                        );
                        const isDownloaded = customModel.isDownloaded;

                        return (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{
                              text: isDownloaded ? "LOCAL" : "NOT DOWNLOADED",
                              variant: isDownloaded ? "success" : "secondary",
                              icon: "hardware-chip-outline",
                            }}
                            isSelected={isSelected}
                            isDownloading={isDownloading}
                            downloadProgress={downloadProgress.get(
                              model.modelId,
                            )}
                            canSelect={isDownloaded}
                            canDownload={!isDownloaded}
                            canEdit
                            canRemove
                            onSelect={() =>
                              handleSelectCustomLocalSttModel(model)
                            }
                            onDownload={() =>
                              handleDownloadCustomLocalSttModel(customModel)
                            }
                            onEdit={() =>
                              handleEditCustomLocalSttModel(customModel)
                            }
                            onRemove={() =>
                              handleRemoveCustomLocalSttModelWithFiles(
                                customModel,
                              )
                            }
                          />
                        );
                      })
                    )}

                    {/* Remote Voice APIs Section */}
                    <View style={styles.downloadableSectionHeader}>
                      <Ionicons
                        name="cloud-outline"
                        size={14}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="caption"
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontWeight: "600",
                          flex: 1,
                        }}
                      >
                        Remote Voice APIs
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.addRemoteButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={() => setShowAddRemoteSttModal(true)}
                      >
                        <Ionicons name="add" size={14} color="white" />
                        <Text
                          variant="caption"
                          style={{
                            color: "white",
                            fontWeight: "600",
                            fontSize: 11,
                          }}
                        >
                          Add
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {remoteSttModels.length === 0 ? (
                      <View
                        style={[
                          styles.noModelsBanner,
                          { backgroundColor: `${theme.colors.border}15` },
                        ]}
                      >
                        <Ionicons
                          name="cloud-outline"
                          size={16}
                          color={seasonalTheme.textSecondary}
                        />
                        <Text
                          variant="caption"
                          style={{
                            color: seasonalTheme.textSecondary,
                            flex: 1,
                          }}
                        >
                          Add remote voice APIs (OpenAI Whisper, Groq) for
                          cloud-based speech-to-text.
                        </Text>
                      </View>
                    ) : (
                      remoteSttModels.map((model) => {
                        const isSelected = selectedSTTId === model.modelId;
                        return (
                          <ModelCard
                            key={model.modelId}
                            displayName={model.displayName}
                            description={model.description}
                            badge={{
                              text: "REMOTE",
                              variant: "accent",
                              icon: "cloud-outline",
                            }}
                            isSelected={isSelected}
                            canSelect
                            canEdit
                            canRemove
                            onSelect={() => handleSelectRemoteSttModel(model)}
                            onEdit={() => handleEditRemoteSttModel(model)}
                            onRemove={() => handleRemoveRemoteSttModel(model)}
                          />
                        );
                      })
                    )}
                  </View>
                )}

                {/* Agents Tab */}
                {activeTab === "agents" && (
                  <View style={styles.tabContent}>
                    <View style={styles.agentsHeader}>
                      <Text
                        variant="caption"
                        style={[
                          styles.description,
                          { color: seasonalTheme.textSecondary, flex: 1 },
                        ]}
                      >
                        Custom AI personalities with unique instructions and
                        model preferences.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.createAgentButton,
                          { backgroundColor: theme.colors.accent },
                        ]}
                        onPress={handleCreateAgent}
                      >
                        <Ionicons name="add" size={16} color="white" />
                        <Text
                          variant="caption"
                          style={{ color: "white", fontWeight: "600" }}
                        >
                          New Persona
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.agentsList}>
                      {agents.map((agent) => {
                        const agentModel = agent.modelId
                          ? ALL_LLM_MODELS.find(
                              (m) => m.modelId === agent.modelId,
                            )
                          : null;
                        return (
                          <TouchableOpacity
                            key={agent.id}
                            style={[
                              styles.agentCard,
                              {
                                backgroundColor: seasonalTheme.cardBg,
                                borderColor: agent.isDefault
                                  ? theme.colors.accent
                                  : `${theme.colors.border}40`,
                              },
                            ]}
                            onPress={() => handleSetDefaultAgent(agent)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.agentCardHeader}>
                              <View style={styles.agentNameRow}>
                                <Text
                                  variant="body"
                                  style={[
                                    styles.agentName,
                                    { color: seasonalTheme.textPrimary },
                                  ]}
                                >
                                  {agent.name}
                                </Text>
                                {agent.isDefault && (
                                  <View
                                    style={[
                                      styles.defaultBadge,
                                      {
                                        backgroundColor: `${theme.colors.accent}20`,
                                      },
                                    ]}
                                  >
                                    <Text
                                      variant="caption"
                                      style={{
                                        color: theme.colors.accent,
                                        fontSize: 10,
                                        fontWeight: "600",
                                      }}
                                    >
                                      DEFAULT
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.agentActions}>
                                <TouchableOpacity
                                  style={styles.agentActionButton}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleEditAgent(agent);
                                  }}
                                >
                                  <Ionicons
                                    name="pencil-outline"
                                    size={16}
                                    color={seasonalTheme.textSecondary}
                                  />
                                </TouchableOpacity>
                                {!agent.isDefault && (
                                  <TouchableOpacity
                                    style={styles.agentActionButton}
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleDeleteAgent(agent);
                                    }}
                                  >
                                    <Ionicons
                                      name="trash-outline"
                                      size={16}
                                      color={theme.colors.error}
                                    />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                            <Text
                              variant="caption"
                              style={[
                                styles.agentPromptPreview,
                                { color: seasonalTheme.textSecondary },
                              ]}
                              numberOfLines={2}
                            >
                              {agent.systemPrompt}
                            </Text>
                            <View style={styles.agentMeta}>
                              {agentModel && (
                                <View
                                  style={[
                                    styles.thinkModeBadge,
                                    {
                                      backgroundColor: `${theme.colors.border}30`,
                                    },
                                  ]}
                                >
                                  <Text
                                    variant="caption"
                                    style={{
                                      color: seasonalTheme.textSecondary,
                                      fontSize: 10,
                                    }}
                                  >
                                    {agentModel.displayName}
                                  </Text>
                                </View>
                              )}
                              <View
                                style={[
                                  styles.thinkModeBadge,
                                  {
                                    backgroundColor: `${theme.colors.border}30`,
                                  },
                                ]}
                              >
                                <Text
                                  variant="caption"
                                  style={{
                                    color: seasonalTheme.textSecondary,
                                    fontSize: 10,
                                  }}
                                >
                                  {agent.thinkMode === "no-think"
                                    ? "No Think"
                                    : agent.thinkMode === "think"
                                      ? "Think"
                                      : "None"}
                                </Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Add/Edit Remote Model Modal (LLM) */}
      <AddRemoteModelModal
        visible={showAddRemoteModal}
        onClose={() => {
          setShowAddRemoteModal(false);
          setEditingRemoteModel(null);
        }}
        onModelAdded={handleRemoteModelAdded}
        editModel={editingRemoteModel}
        modelCategory="llm"
      />

      {/* Add/Edit Remote Voice Model Modal (STT) */}
      <AddRemoteModelModal
        visible={showAddRemoteSttModal}
        onClose={() => {
          setShowAddRemoteSttModal(false);
          setEditingRemoteSttModel(null);
        }}
        onModelAdded={handleRemoteSttModelAdded}
        editModel={editingRemoteSttModel}
        modelCategory="stt"
      />

      {/* Add/Edit Custom Local Model Modal */}
      <AddCustomLocalModelModal
        visible={showAddCustomLocalModal}
        onClose={() => {
          setShowAddCustomLocalModal(false);
          setEditingCustomLocalModel(null);
        }}
        onModelAdded={handleCustomLocalModelAdded}
        editModel={editingCustomLocalModel}
      />

      {/* Add/Edit Custom Local STT Model Modal */}
      <AddCustomLocalModelModal
        visible={showAddCustomLocalSttModal}
        onClose={() => {
          setShowAddCustomLocalSttModal(false);
          setEditingCustomLocalSttModel(null);
        }}
        onModelAdded={handleCustomLocalSttModelAdded}
        modelCategory="stt"
        editModel={editingCustomLocalSttModel}
      />

      {/* Persona Editor Modal */}
      <PersonaEditor
        visible={showAgentEditor}
        onClose={handleCancelAgentEditor}
        persona={editingAgent}
        downloadedModels={downloadedLLMs.map((id) => ({
          modelId: id,
          modelType: "llm" as const,
          downloadedAt: 0,
          ptePath: "",
          tokenizerPath: "",
          size: 0,
        }))}
        customLocalModels={customLocalModels.filter(
          (m): m is CustomLocalModelConfig =>
            m.modelType === "custom-local" &&
            (m as CustomLocalModelConfig).isDownloaded &&
            m.isEnabled,
        )}
        remoteModels={remoteModels.filter(
          (m): m is RemoteModelConfig =>
            m.modelType === "remote-api" &&
            m.isEnabled &&
            (m as RemoteModelConfig).privacyAcknowledged,
        )}
        onSave={handleSaveAgent}
        isLoading={savingAgent}
      />
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
  container: {
    width: "90%",
    maxWidth: 500,
    height: "75%",
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
        shadowColor: "#000",
      },
    }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.md,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: spacingPatterns.xxs,
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: spacingPatterns.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacingPatterns.sm,
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacingPatterns.md,
  },
  tabContent: {
    padding: spacingPatterns.md,
    gap: spacingPatterns.xs,
  },
  description: {
    marginBottom: spacingPatterns.sm,
    fontSize: 12,
  },
  loadingContainer: {
    padding: spacingPatterns.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  noModelsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacingPatterns.sm,
  },
  agentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  createAgentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.sm,
  },
  agentsList: {
    gap: spacingPatterns.sm,
  },
  agentCard: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
  },
  agentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacingPatterns.xs,
  },
  agentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    flex: 1,
  },
  agentName: {
    fontWeight: "600",
    fontSize: 14,
  },
  defaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  agentActions: {
    flexDirection: "row",
    gap: spacingPatterns.xs,
  },
  agentActionButton: {
    padding: 4,
  },
  agentPromptPreview: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacingPatterns.xs,
  },
  agentMeta: {
    flexDirection: "row",
    gap: spacingPatterns.xs,
  },
  thinkModeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  platformSection: {
    gap: spacingPatterns.xs,
  },
  platformHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  downloadableSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.sm,
    marginBottom: spacingPatterns.xs,
    paddingTop: spacingPatterns.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
  },
  addRemoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
});
