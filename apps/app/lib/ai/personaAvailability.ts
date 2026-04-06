/**
 * Persona availability helpers.
 *
 * Personas (a.k.a. agents) reference an LLM model by `modelId`. Since models
 * have per-platform availability (mobile-only .pte, web-only MLC, desktop-only
 * GGUF), a persona may reference a model that can't run on the current device.
 *
 * These helpers answer "is this persona usable here?" so the UI can hide or
 * warn about unavailable personas.
 *
 * Family fallback: each `LlmModelConfig` may declare a `modelFamily` identifier
 * that groups platform variants of the same base model (e.g. "llama-3.2-3b"
 * applies to the mobile .pte, web MLC, and desktop GGUF variants). When a
 * persona's exact model is not runnable on the current platform, we fall back
 * to a same-family sibling that is — so a persona created on mobile can still
 * answer messages on desktop, and vice versa.
 */

import { getModelCategory } from "./modelTypeGuards";
import { isModelAvailableOnPlatform, type AppPlatform } from "./platformFilter";
import type { LlmModelConfig } from "./modelConfig";

/** Minimal persona shape needed for availability checks. */
export interface PersonaModelRef {
  modelId: string;
}

/**
 * Detailed resolution info for UI use. Explains whether the persona is
 * usable on this platform, and whether a family-fallback sibling was
 * selected in place of the persona's configured modelId.
 */
export interface PersonaResolutionInfo {
  available: boolean;
  originalModelId: string;
  resolvedModelId: string | null;
  usingFallback: boolean;
  displayName: string | null;
}

/**
 * Category prefix used to prefer same-class siblings during fallback
 * resolution. E.g. on `tauri`/`macos` we prefer `desktop-*` siblings over
 * `web-*` siblings even if both would technically run.
 */
function preferredPrefixForPlatform(platform: AppPlatform): string | null {
  if (platform === "tauri" || platform === "macos") return "desktop-";
  if (platform === "web") return "web-";
  return null;
}

/**
 * Resolves a persona's modelId to an actual usable modelId on the given
 * platform.
 *
 * - If the persona's exact modelId is available on platform, returns it.
 * - Otherwise, returns a same-family sibling available on the platform, if
 *   one exists. When multiple siblings match, prefers the one matching the
 *   current runtime category (desktop-* on tauri/macos, web-* on web).
 * - Returns null if no usable model exists on this platform.
 *
 * Category rules:
 * - remote: always resolves to itself (API calls, platform-agnostic).
 * - custom-local: resolves to itself only on mobile.
 * - platform: resolves based on OS match (apple-foundation on ios/macos,
 *   gemini-nano on android).
 */
export function resolvePersonaModel(
  persona: PersonaModelRef,
  allModels: LlmModelConfig[],
  platform: AppPlatform,
): string | null {
  const category = getModelCategory(persona.modelId);

  // Remote models work everywhere (they're API calls)
  if (category === "remote") return persona.modelId;

  // Custom local models only work on mobile
  if (category === "custom-local") {
    return platform === "ios" || platform === "android"
      ? persona.modelId
      : null;
  }

  // Platform models match their OS
  if (category === "platform") {
    if (
      persona.modelId === "apple-foundation" &&
      (platform === "ios" || platform === "macos")
    ) {
      return persona.modelId;
    }
    if (persona.modelId === "gemini-nano" && platform === "android") {
      return persona.modelId;
    }
    return null;
  }

  // Built-in, web-llm, desktop-llm: check exact first, then family siblings.
  const exactModel = allModels.find((m) => m.modelId === persona.modelId);
  if (exactModel && isModelAvailableOnPlatform(exactModel, platform)) {
    return persona.modelId;
  }

  // Family fallback: only if the original model declares a family.
  if (!exactModel?.modelFamily) return null;

  const family = exactModel.modelFamily;
  const siblings = allModels.filter(
    (m) =>
      m.modelFamily === family &&
      m.modelId !== persona.modelId &&
      isModelAvailableOnPlatform(m, platform),
  );
  if (siblings.length === 0) return null;

  // Prefer the sibling that matches the current platform's category
  // (desktop-* on tauri/macos, web-* on web). Otherwise, pick the first.
  const preferredPrefix = preferredPrefixForPlatform(platform);
  if (preferredPrefix) {
    const preferred = siblings.find((s) =>
      s.modelId.startsWith(preferredPrefix),
    );
    if (preferred) return preferred.modelId;
  }

  return siblings[0].modelId;
}

/**
 * Check whether a persona's underlying model can run on the given platform.
 *
 * Now backed by {@link resolvePersonaModel} — returns true if the exact model
 * or any same-family sibling is runnable here.
 */
export function isPersonaAvailableOnPlatform(
  persona: PersonaModelRef,
  allModels: LlmModelConfig[],
  platform: AppPlatform,
): boolean {
  return resolvePersonaModel(persona, allModels, platform) !== null;
}

/**
 * Returns detailed resolution info for UI (whether fallback is in use,
 * display name of the resolved model). Use this when the UI needs to
 * explain to users which model is actually running for a persona.
 */
export function getPersonaResolutionInfo(
  persona: PersonaModelRef,
  allModels: LlmModelConfig[],
  platform: AppPlatform,
): PersonaResolutionInfo {
  const resolvedModelId = resolvePersonaModel(persona, allModels, platform);
  const resolved = resolvedModelId
    ? allModels.find((m) => m.modelId === resolvedModelId)
    : null;
  return {
    available: resolvedModelId !== null,
    originalModelId: persona.modelId,
    resolvedModelId,
    usingFallback:
      resolvedModelId !== null && resolvedModelId !== persona.modelId,
    displayName: resolved?.displayName ?? null,
  };
}

/**
 * Filter an array of personas to only those available on the current platform.
 * Preserves original order.
 */
export function getAvailablePersonas<T extends PersonaModelRef>(
  personas: T[],
  allModels: LlmModelConfig[],
  platform: AppPlatform,
): T[] {
  return personas.filter((p) =>
    isPersonaAvailableOnPlatform(p, allModels, platform),
  );
}
