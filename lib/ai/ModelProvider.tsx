/**
 * ModelProvider - Handles model initialization and verification on app startup
 *
 * This provider:
 * - Verifies downloaded models still exist on disk
 * - Cleans up stale download state
 * - Provides model config context for settings UI
 *
 * Note: Actual LLM loading/generation is handled by LLMProvider.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useModelSettings } from "../db/modelSettings";
import { LlmModelConfig, DEFAULT_MODEL, ALL_MODELS } from "./modelConfig";
import { modelDownloadStatus } from "./modelDownloadStatus";
import { logStorageDebugInfo, verifyAllModels } from "./modelVerification";
import { persistentDownloadManager } from "./persistentDownloadManager";

interface ModelContextValue {
  /** Reload model - updates settings, LLMProvider will pick up the change */
  reloadModel: (config: LlmModelConfig) => Promise<void>;
  /** Current model configuration */
  currentConfig: LlmModelConfig;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error("useModel must be used within ModelProvider");
  }
  return context;
}

export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [currentConfig, setCurrentConfig] =
    useState<LlmModelConfig>(DEFAULT_MODEL);
  const modelSettings = useModelSettings();

  // Initialize and verify models on mount
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        // Log storage debug info (helps diagnose Android issues)
        await logStorageDebugInfo();

        // Initialize download status manager (loads persisted state)
        await modelDownloadStatus.initialize();

        // Verify all downloaded models still exist (Android can clear cache)
        const downloadedModels = await modelSettings.getDownloadedModels();
        if (downloadedModels.length > 0) {
          const verification = await verifyAllModels(
            downloadedModels.map((m) => m.modelId),
            ALL_MODELS,
          );

          if (verification.missing.length > 0) {
            console.warn(
              `[ModelProvider] ${verification.missing.length} model(s) missing from disk`,
            );

            // Clean up database entries for missing models
            for (const missingModelId of verification.missing) {
              await modelSettings.removeDownloadedModel(missingModelId);
            }
          }
        }

        // Clean up old/stale downloads (older than 7 days)
        await persistentDownloadManager.cleanupOldDownloads();

        // Load current selected model config
        const selectedId = await modelSettings.getSelectedModelId();
        if (selectedId && isMounted) {
          const config = ALL_MODELS.find((m) => m.modelId === selectedId);
          if (config) {
            setCurrentConfig(config);
          }
        }
      } catch (error) {
        console.error("[ModelProvider] Failed to initialize:", error);
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [modelSettings]);

  const reloadModel = useCallback(
    async (config: LlmModelConfig) => {
      // Update settings - LLMProvider will need to be notified separately
      // For now, this requires an app restart to take effect
      await modelSettings.setSelectedModelId(config.modelId);
      setCurrentConfig(config);
    },
    [modelSettings],
  );

  const value: ModelContextValue = {
    reloadModel,
    currentConfig,
  };

  return (
    <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
  );
}
