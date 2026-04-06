/**
 * LLM Router
 *
 * Routes `sendMessage` calls to the correct local inference engine
 * (web-llm / tauri-llm) based on the model ID prefix.
 *
 * The router is a small, dependency-injected singleton-friendly module
 * that owns the active non-executorch engine slot. Executorch (mobile)
 * continues to be managed directly by UnifiedModelProvider — this router
 * only adds web-llm and desktop-llm paths.
 *
 * Design:
 * - At most one engine slot (webLLM | tauriLLM) is populated at a time
 * - Switching engines unloads the previous one first
 * - System-prompt + thinkMode handling mirrors sendLLMMessage
 * - Qwen-specific `/no_think` prefix is gated on `modelId.includes("qwen")`
 */

import { DEFAULT_SYSTEM_PROMPT, type LlmModelConfig } from "./modelConfig";
import type { TauriLLMEngine, TauriLLMMessage } from "../platform/tauriLLM";
import type { WebLLMEngine, WebLLMMessage } from "../platform/webLLM";
import type { Message } from "react-native-executorch";

// =============================================================================
// TYPES
// =============================================================================

export interface LLMRouterSendOptions {
  responseCallback?: (responseSoFar: string) => void;
  completeCallback?: (result: string) => void;
  systemPrompt?: string;
  thinkMode?: "no-think" | "think" | "none";
}

export interface LLMRouterDependencies {
  /** Factory for a fresh WebLLM engine (usually the real implementation). */
  createWebLLMEngine: () => WebLLMEngine;
  /** Factory for a fresh Tauri LLM engine (usually the real implementation). */
  createTauriLLMEngine: () => TauriLLMEngine;
  /**
   * Download the GGUF file for a desktop model and return the absolute path.
   * Mirrors `ensureModelPresent` but returns just the pte/gguf path.
   */
  ensureDesktopModelPresent: (config: LlmModelConfig) => Promise<string>;
  /** Runtime gate: we're running in a browser (`Platform.OS === "web"`). */
  isWebPlatform: () => boolean;
  /** Runtime gate: we're running inside a Tauri webview. */
  isTauriPlatform: () => boolean;
}

export interface LLMRouter {
  sendWebLLMMessage: (
    modelId: string,
    messages: Message[],
    options?: LLMRouterSendOptions,
  ) => Promise<string>;
  sendTauriLLMMessage: (
    config: LlmModelConfig,
    messages: Message[],
    options?: LLMRouterSendOptions,
  ) => Promise<string>;
  interruptAll: () => void;
  unloadAll: () => Promise<void>;
  isAnyLoaded: () => boolean;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

interface RouterState {
  webLLM?: { modelId: string; engine: WebLLMEngine };
  tauriLLM?: { modelId: string; engine: TauriLLMEngine };
}

// =============================================================================
// HELPERS
// =============================================================================

function isQwenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("qwen");
}

/**
 * Apply system-prompt + thinkMode logic, producing the final message list
 * passed to the underlying engine.
 */
function prepareMessages(
  modelId: string,
  messages: Message[],
  options: LLMRouterSendOptions | undefined,
): Message[] {
  const thinkMode = options?.thinkMode ?? "no-think";
  const baseSystemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  if (thinkMode === "none") {
    return messages;
  }

  let systemPrompt = baseSystemPrompt;
  if (
    thinkMode === "no-think" &&
    isQwenModel(modelId) &&
    !systemPrompt.startsWith("/no_think")
  ) {
    systemPrompt = `/no_think ${systemPrompt}`;
  }

  return [{ role: "system", content: systemPrompt }, ...messages];
}

function toWebLLMMessages(messages: Message[]): WebLLMMessage[] {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
}

function toTauriLLMMessages(messages: Message[]): TauriLLMMessage[] {
  return messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));
}

// =============================================================================
// FACTORY
// =============================================================================

export function createLLMRouter(deps: LLMRouterDependencies): LLMRouter {
  const state: RouterState = {};

  async function unloadTauri(): Promise<void> {
    if (!state.tauriLLM) return;
    try {
      await state.tauriLLM.engine.unload();
    } catch {
      // best-effort cleanup
    }
    delete state.tauriLLM;
  }

  async function unloadWeb(): Promise<void> {
    if (!state.webLLM) return;
    try {
      await state.webLLM.engine.unload();
    } catch {
      // best-effort cleanup
    }
    delete state.webLLM;
  }

  async function ensureWebLoaded(modelId: string): Promise<WebLLMEngine> {
    // If tauri is loaded, unload it first.
    if (state.tauriLLM) {
      await unloadTauri();
    }

    // Same model already loaded — no-op.
    if (state.webLLM && state.webLLM.modelId === modelId) {
      return state.webLLM.engine;
    }

    // Different web model — unload old then load new.
    if (state.webLLM) {
      await unloadWeb();
    }

    const engine = deps.createWebLLMEngine();
    await engine.load({ modelId });
    state.webLLM = { modelId, engine };
    return engine;
  }

  async function ensureTauriLoaded(
    config: LlmModelConfig,
  ): Promise<TauriLLMEngine> {
    // If web is loaded, unload it first.
    if (state.webLLM) {
      await unloadWeb();
    }

    // Same model already loaded — no-op.
    if (state.tauriLLM && state.tauriLLM.modelId === config.modelId) {
      return state.tauriLLM.engine;
    }

    // Different tauri model — unload old then load new.
    if (state.tauriLLM) {
      await unloadTauri();
    }

    const modelPath = await deps.ensureDesktopModelPresent(config);
    const engine = deps.createTauriLLMEngine();
    await engine.load({ modelPath, modelId: config.modelId });
    state.tauriLLM = { modelId: config.modelId, engine };
    return engine;
  }

  async function sendWebLLMMessage(
    modelId: string,
    messages: Message[],
    options?: LLMRouterSendOptions,
  ): Promise<string> {
    if (!deps.isWebPlatform()) {
      throw new Error("Web LLM is only available in web browsers");
    }

    const engine = await ensureWebLoaded(modelId);
    const prepared = prepareMessages(modelId, messages, options);
    const webMessages = toWebLLMMessages(prepared);

    let accumulated = "";
    const result = await engine.generate(webMessages, {
      onToken: (token) => {
        accumulated += token;
        options?.responseCallback?.(accumulated);
      },
    });

    const final = result.length > 0 ? result : accumulated;
    options?.completeCallback?.(final);
    return final;
  }

  async function sendTauriLLMMessage(
    config: LlmModelConfig,
    messages: Message[],
    options?: LLMRouterSendOptions,
  ): Promise<string> {
    if (!deps.isTauriPlatform()) {
      throw new Error("Desktop LLM is only available via Tauri");
    }

    const engine = await ensureTauriLoaded(config);
    const prepared = prepareMessages(config.modelId, messages, options);
    const tauriMessages = toTauriLLMMessages(prepared);

    let accumulated = "";
    const result = await engine.generate(tauriMessages, {
      onToken: (token) => {
        accumulated += token;
        options?.responseCallback?.(accumulated);
      },
    });

    const final = result.length > 0 ? result : accumulated;
    options?.completeCallback?.(final);
    return final;
  }

  function interruptAll(): void {
    state.webLLM?.engine.interrupt();
    if (state.tauriLLM) {
      void state.tauriLLM.engine.interrupt().catch(() => {
        // best-effort
      });
    }
  }

  async function unloadAll(): Promise<void> {
    await Promise.all([unloadWeb(), unloadTauri()]);
  }

  function isAnyLoaded(): boolean {
    return state.webLLM !== undefined || state.tauriLLM !== undefined;
  }

  return {
    sendWebLLMMessage,
    sendTauriLLMMessage,
    interruptAll,
    unloadAll,
    isAnyLoaded,
  };
}
