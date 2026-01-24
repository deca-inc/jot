// React hook for platform model availability
// Checks and caches platform model availability at app startup

import { useEffect, useState } from "react";
import {
  checkPlatformModelsAvailability,
  getAvailablePlatformLLMs,
  getAvailablePlatformSTTs,
  type PlatformLlmConfig,
  type PlatformModelAvailability,
  type PlatformSttConfig,
} from "./platformModels";

// =============================================================================
// SINGLETON CACHE
// =============================================================================

// Cache availability at module level to avoid re-checking
let cachedAvailability: PlatformModelAvailability | null = null;
let availabilityPromise: Promise<PlatformModelAvailability> | null = null;

/**
 * Get platform model availability (cached)
 * Safe to call multiple times - only checks once
 */
export async function getPlatformAvailability(): Promise<PlatformModelAvailability> {
  if (cachedAvailability) {
    return cachedAvailability;
  }

  if (!availabilityPromise) {
    availabilityPromise = checkPlatformModelsAvailability().then((result) => {
      cachedAvailability = result;
      return result;
    });
  }

  return availabilityPromise;
}

/**
 * Clear cached availability (for testing or after device changes)
 */
export function clearPlatformAvailabilityCache(): void {
  cachedAvailability = null;
  availabilityPromise = null;
}

// =============================================================================
// REACT HOOK
// =============================================================================

export interface UsePlatformModelsResult {
  isLoading: boolean;
  availability: PlatformModelAvailability | null;
  platformLLMs: PlatformLlmConfig[];
  platformSTTs: PlatformSttConfig[];
  hasPlatformLLM: boolean;
  hasPlatformSTT: boolean;
}

/**
 * Hook to get available platform models for the current device
 *
 * @example
 * ```tsx
 * function ModelSelector() {
 *   const { platformLLMs, hasPlatformLLM, isLoading } = usePlatformModels();
 *
 *   if (isLoading) return <Loading />;
 *
 *   return (
 *     <>
 *       {hasPlatformLLM && (
 *         <Section title="Built-in Models">
 *           {platformLLMs.map(model => <ModelCard key={model.modelId} model={model} />)}
 *         </Section>
 *       )}
 *       <Section title="Downloadable Models">
 *         {downloadableModels.map(model => <ModelCard key={model.modelId} model={model} />)}
 *       </Section>
 *     </>
 *   );
 * }
 * ```
 */
export function usePlatformModels(): UsePlatformModelsResult {
  const [isLoading, setIsLoading] = useState(!cachedAvailability);
  const [availability, setAvailability] =
    useState<PlatformModelAvailability | null>(cachedAvailability);

  useEffect(() => {
    if (cachedAvailability) {
      setAvailability(cachedAvailability);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    getPlatformAvailability().then((result) => {
      if (mounted) {
        setAvailability(result);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const platformLLMs = availability
    ? getAvailablePlatformLLMs(availability)
    : [];
  const platformSTTs = availability
    ? getAvailablePlatformSTTs(availability)
    : [];

  return {
    isLoading,
    availability,
    platformLLMs,
    platformSTTs,
    hasPlatformLLM: platformLLMs.length > 0,
    hasPlatformSTT: platformSTTs.length > 0,
  };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export {
  isPlatformModel,
  isPlatformModelId,
  platformModelSupportsSystemPrompt,
  getPlatformModelAgentWarning,
  getAvailablePlatformLLMs,
  PLATFORM_LLM_IDS,
  PLATFORM_STT_IDS,
} from "./platformModels";

export type { PlatformLlmConfig, PlatformSttConfig } from "./platformModels";
