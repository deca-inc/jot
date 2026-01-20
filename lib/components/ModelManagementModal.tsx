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
} from "../ai/modelManager";
import { ALL_STT_MODELS } from "../ai/sttConfig";
import { useUnifiedModel } from "../ai/UnifiedModelProvider";
import { type Agent, type ThinkMode, useAgents } from "../db/agents";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { getDeviceTier, getCompatibleModels } from "../utils/deviceInfo";
import { AgentEditor } from "./AgentEditor";
import { ModelCard } from "./ModelCard";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

export type ModelManagementTab = "llms" | "voice" | "agents";

export interface ModelManagementModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: ModelManagementTab;
}

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
  const [deviceTier, setDeviceTier] = useState<string>("mid");

  // STT state
  const [selectedSTTId, setSelectedSTTId] = useState<string | null>(null);
  const [downloadedSTTs, setDownloadedSTTs] = useState<string[]>([]);

  // Agents state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAgentEditor, setShowAgentEditor] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);

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
      ] = await Promise.all([
        modelSettings.getSelectedModelId(),
        modelSettings.getSelectedSttModelId(),
        modelSettings.getDownloadedModels(),
        getCompatibleModels(),
        getDeviceTier(),
        agentsRepo.getAll(),
      ]);

      setSelectedLLMId(selectedLlmId);
      setSelectedSTTId(selectedSttId);
      setCompatibleModels(compatible);
      setDeviceTier(tier);
      setAgents(agentsList);

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

  const handleRemoveLLM = useCallback(
    async (model: LlmModelConfig) => {
      // Check if any agents are using this model
      const agentsUsingModel = await agentsRepo.getByModelId(model.modelId);

      if (agentsUsingModel.length > 0) {
        const agentNames = agentsUsingModel.map((a) => a.name).join(", ");
        Alert.alert(
          "Cannot Remove Model",
          `This model is being used by the following agent(s): ${agentNames}.\n\nUpdate or delete these agents first.`,
          [{ text: "OK", style: "default" }],
        );
        return;
      }

      Alert.alert(
        "Remove Model",
        `Are you sure you want to remove ${model.displayName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
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
    [modelSettings, showToast, agentsRepo],
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
            new Map(prev).set(model.modelId, Math.round(progress * 100)),
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
      Alert.alert(
        "Remove Model",
        `Are you sure you want to remove ${model.displayName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
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
    [modelSettings, showToast],
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
        showToast(err?.message || "Failed to save agent", "error");
      } finally {
        setSavingAgent(false);
      }
    },
    [agentsRepo, editingAgent, showToast],
  );

  const handleDeleteAgent = useCallback(
    (agent: Agent) => {
      if (agent.isDefault) {
        showToast("Cannot delete the default agent", "error");
        return;
      }

      Alert.alert(
        "Delete Agent",
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
                showToast(err?.message || "Failed to delete agent", "error");
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
    { key: "agents", label: "Agents", icon: "person-circle-outline" },
  ];

  const dialogBackground = seasonalTheme.gradient.middle;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.container, { backgroundColor: dialogBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
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
            showsVerticalScrollIndicator
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
                    <Text
                      variant="caption"
                      style={[
                        styles.description,
                        { color: seasonalTheme.textSecondary },
                      ]}
                    >
                      Device: {deviceTier}-end. Download models to use them.
                    </Text>
                    <View style={styles.modelsList}>
                      {sortedLLMs.map((model) => (
                        <ModelCard
                          key={model.modelId}
                          model={model}
                          isDownloaded={downloadedLLMs.includes(model.modelId)}
                          isSelected={selectedLLMId === model.modelId}
                          isDownloading={downloadingModels.has(model.modelId)}
                          isLoading={loadingModelId === model.modelId}
                          isNotRecommended={
                            !compatibleModels.includes(model.modelId)
                          }
                          downloadProgress={downloadProgress.get(model.modelId)}
                          onDownload={() => handleDownloadLLM(model)}
                          onSelect={() => handleSelectLLM(model)}
                          onRemove={() => handleRemoveLLM(model)}
                        />
                      ))}
                    </View>
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
                    {downloadedSTTs.length === 0 && (
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
                    <View style={styles.modelsList}>
                      {sortedSTTs.map((model) => (
                        <ModelCard
                          key={model.modelId}
                          model={model}
                          isDownloaded={downloadedSTTs.includes(model.modelId)}
                          isSelected={selectedSTTId === model.modelId}
                          isDownloading={downloadingModels.has(model.modelId)}
                          isLoading={false}
                          downloadProgress={downloadProgress.get(model.modelId)}
                          onDownload={() => handleDownloadSTT(model)}
                          onSelect={() => handleSelectSTT(model)}
                          onRemove={() => handleRemoveSTT(model)}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* Agents Tab */}
                {activeTab === "agents" && (
                  <View style={styles.tabContent}>
                    {showAgentEditor ? (
                      <AgentEditor
                        agent={editingAgent}
                        downloadedModels={downloadedLLMs.map((id) => ({
                          modelId: id,
                          modelType: "llm" as const,
                          downloadedAt: 0,
                          ptePath: "",
                          tokenizerPath: "",
                          size: 0,
                        }))}
                        onSave={handleSaveAgent}
                        onCancel={handleCancelAgentEditor}
                        isLoading={savingAgent}
                      />
                    ) : (
                      <>
                        <View style={styles.agentsHeader}>
                          <Text
                            variant="caption"
                            style={[
                              styles.description,
                              { color: seasonalTheme.textSecondary, flex: 1 },
                            ]}
                          >
                            Create custom AI personas with different system
                            prompts.
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
                              New Agent
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
                      </>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
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
    flexGrow: 1,
    paddingBottom: spacingPatterns.md,
  },
  tabContent: {
    padding: spacingPatterns.md,
  },
  description: {
    marginBottom: spacingPatterns.sm,
    fontSize: 12,
  },
  modelsList: {
    gap: spacingPatterns.xs,
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
});
