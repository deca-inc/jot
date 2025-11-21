/**
 * LLMQueue - Single instance LLM with request queue
 *
 * This prevents OOM crashes by ensuring only one LLM instance exists at a time.
 * All requests are queued and processed sequentially.
 */

import { LLMModule, Message as LlmMessage } from "react-native-executorch";
import { LlmModelConfig } from "./modelConfig";
import { ensureModelPresent } from "./modelManager";

interface QueuedRequest {
  id: string;
  messages: LlmMessage[];
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

interface LLMQueueConfig {
  onToken?: (token: string) => void;
  onMessageHistoryUpdate?: (messages: LlmMessage[]) => void;
}

interface QueuedModelChange {
  config: LlmModelConfig;
  resolve: () => void;
  reject: (error: Error) => void;
}

type ConversationCallbacks = Map<string, LLMQueueConfig>;

/**
 * Single-instance LLM with request queue
 *
 * Prevents OOM by ensuring only one LLM model (100+ MB) exists at a time.
 * All generation requests are queued and processed sequentially.
 */
class LLMQueueService {
  private llm: LLMModule | null = null;
  private isLoaded = false;
  private isLoading = false;
  private isProcessing = false;
  private queue: QueuedRequest[] = [];
  private modelChangeQueue: QueuedModelChange[] = [];
  private config: LlmModelConfig | null = null;
  private loadPromise: Promise<void> | null = null;
  private conversationCallbacks: ConversationCallbacks = new Map();
  private currentRequestId: string | null = null;
  private isDeleted = false;
  private isChangingModel = false;
  private unloadPromise: Promise<void> | null = null;

  /**
   * Register callbacks for a conversation
   */
  registerCallbacks(convoId: string, callbacks: LLMQueueConfig): void {
    this.conversationCallbacks.set(convoId, callbacks);
  }

  /**
   * Unregister callbacks for a conversation
   */
  unregisterCallbacks(convoId: string): void {
    this.conversationCallbacks.delete(convoId);
  }

  /**
   * Get callbacks for current request (based on request ID)
   */
  private getCurrentCallbacks(): LLMQueueConfig | null {
    if (!this.currentRequestId) {
      return null;
    }
    return this.conversationCallbacks.get(this.currentRequestId) || null;
  }

  /**
   * Check if the queue is currently busy (processing, loading, or changing models)
   */
  private isBusy(): boolean {
    return this.isProcessing || this.isLoading || this.isChangingModel;
  }

  /**
   * Check if ready to process requests
   */
  private isReadyToProcess(): boolean {
    return this.isLoaded && !this.isDeleted && !this.isBusy();
  }

  /**
   * Queue a request for later processing
   */
  private queueRequest(
    requestId: string,
    messages: LlmMessage[]
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({
        id: requestId,
        messages,
        resolve,
        reject,
      });
    });
  }

  /**
   * Load the LLM model (only if not already loaded)
   */
  async load(config: LlmModelConfig): Promise<void> {
    // If already loaded with same config, return
    if (
      this.isLoaded &&
      this.config?.modelId === config.modelId &&
      !this.isChangingModel
    ) {
      return;
    }

    // If currently loading, wait for it
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // If already loaded with different config, we need to switch models
    if (this.isLoaded && this.config?.modelId !== config.modelId) {
      // If busy, queue this model change
      if (this.isBusy()) {
        return new Promise<void>((resolve, reject) => {
          this.modelChangeQueue.push({ config, resolve, reject });
        });
      }

      // Otherwise, unload current model and load new one
      await this.safeUnload();
    }

    this.isLoading = true;
    this.isChangingModel = true;
    this.config = config;

    this.loadPromise = (async () => {
      try {
        // Ensure model files are downloaded
        const modelPaths = await ensureModelPresent(config);

        // Create safe callback wrappers that route to the current conversation's callbacks
        const safeTokenCallback = (token: string) => {
          if (this.isDeleted || !this.isLoaded) {
            return;
          }
          try {
            const currentCallbacks = this.getCurrentCallbacks();
            currentCallbacks?.onToken?.(token);
          } catch (e) {
            console.error(`[LLMQueue] Error in token callback:`, e);
          }
        };

        const safeMessageHistoryCallback = (messages: LlmMessage[]) => {
          if (this.isDeleted || !this.isLoaded) {
            return;
          }
          try {
            const currentCallbacks = this.getCurrentCallbacks();
            currentCallbacks?.onMessageHistoryUpdate?.(messages);
          } catch (e) {
            console.error(`[LLMQueue] Error in messageHistory callback:`, e);
          }
        };

        // Create new LLM instance
        this.llm = new LLMModule({
          tokenCallback: safeTokenCallback,
          messageHistoryCallback: safeMessageHistoryCallback,
        });

        // Load model
        await this.llm.load(
          {
            modelSource: modelPaths.ptePath,
            tokenizerSource: modelPaths.tokenizerPath || "",
            tokenizerConfigSource: modelPaths.tokenizerConfigPath || "",
          },
          (progress) => {
            // Download progress callback
          }
        );

        // Small delay to ensure native module is fully initialized
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Configure LLM
        const systemPrompt = "You are a helpful AI assistant.";
        try {
          this.llm.configure({
            chatConfig: {
              initialMessageHistory: [],
              systemPrompt,
            },
          });
        } catch (e) {
          console.error(`[LLMQueue] Failed to configure LLM:`, e);
          await this.unload();
          throw e;
        }

        this.isLoaded = true;
        this.isDeleted = false;

        // Process any queued items (model changes have priority)
        this.processNextInQueue();
      } catch (error) {
        this.isLoaded = false;
        this.llm = null;
        throw error;
      } finally {
        this.isLoading = false;
        this.isChangingModel = false;
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate a response (queued if another request is processing)
   */
  async generate(requestId: string, messages: LlmMessage[]): Promise<string> {
    // CRITICAL: Process any pending model changes FIRST before accepting new requests
    if (this.modelChangeQueue.length > 0 && this.isReadyToProcess()) {
      this.processModelChangeQueue();
      // After triggering model change, queue this request
      return this.queueRequest(requestId, messages);
    }

    // If busy (processing, loading, or changing models), queue the request
    if (this.isBusy()) {
      return this.queueRequest(requestId, messages);
    }

    // CRITICAL: Check actual state - if not loaded and not loading, try to reload
    if (!this.isLoaded && !this.isLoading) {
      // Check if we have a config to reload with
      if (this.config) {
        try {
          await this.load(this.config);
          // Verify it actually loaded
          if (!this.isLoaded) {
            throw new Error("LLM failed to load after reload attempt");
          }
        } catch (loadError) {
          console.error(
            `[LLMQueue] Failed to reload LLM for request ${requestId}:`,
            loadError
          );
          throw new Error(
            `LLM not loaded and reload failed: ${
              loadError instanceof Error ? loadError.message : String(loadError)
            }`
          );
        }
      } else {
        throw new Error(
          "LLM not loaded and no config available to reload. Call load() first."
        );
      }
    }

    // Wait for loading to complete if in progress
    if (this.isLoading && this.loadPromise) {
      try {
        await this.loadPromise;
        // Verify it actually loaded after waiting
        if (!this.isLoaded) {
          throw new Error("LLM failed to load after waiting for load promise");
        }
      } catch (loadError) {
        console.error(
          `[LLMQueue] Load promise failed for request ${requestId}:`,
          loadError
        );
        throw new Error(
          `LLM loading failed: ${
            loadError instanceof Error ? loadError.message : String(loadError)
          }`
        );
      }
    }

    // Final check before proceeding
    if (!this.isLoaded || !this.llm || this.isDeleted) {
      throw new Error(
        `LLM not available: isLoaded=${this.isLoaded}, hasLLM=${!!this
          .llm}, isDeleted=${this.isDeleted}`
      );
    }

    // Final check: if processing now (shouldn't happen after isBusy() check, but defensive)
    if (this.isProcessing) {
      return this.queueRequest(requestId, messages);
    }

    // Process immediately
    return this.processRequest(requestId, messages);
  }

  /**
   * Process a single request
   */
  private async processRequest(
    requestId: string,
    messages: LlmMessage[]
  ): Promise<string> {
    if (!this.llm || !this.isLoaded || this.isDeleted) {
      throw new Error("LLM not available");
    }

    this.isProcessing = true;
    this.currentRequestId = requestId;

    try {
      // NOTE: Don't reset configuration during generation
      // Calling configure() triggers messageHistoryCallback with empty array
      // which tries to overwrite the database (caught by guards but causes confusion)
      // The LLM should be stateless when using generate() with full message context

      // Generate with full message context
      // The messages array contains the complete conversation history
      const response = await this.llm.generate(messages);

      // CRITICAL: Call onMessageHistoryUpdate callback after generation completes
      // This ensures the database and UI are updated with the full conversation
      try {
        const currentCallbacks = this.getCurrentCallbacks();
        if (currentCallbacks?.onMessageHistoryUpdate) {
          // Reconstruct full history including the assistant's response
          const fullHistory = [
            ...messages,
            { role: "assistant" as const, content: response },
          ];
          currentCallbacks.onMessageHistoryUpdate(fullHistory);
        }
      } catch (callbackError) {
        console.error(
          `[LLMQueue] Error in onMessageHistoryUpdate callback:`,
          callbackError
        );
        // Don't throw - generation succeeded, callback error shouldn't fail the request
      }

      return response;
    } catch (error) {
      console.error(
        `[LLMQueue] Generation failed for request ${requestId}:`,
        error
      );
      throw error;
    } finally {
      this.isProcessing = false;
      this.currentRequestId = null;

      // CRITICAL: Always check for model changes first, then requests
      // This ensures model switches have priority over new generations
      this.processNextInQueue();
    }
  }

  /**
   * Process the next item in queue (model changes take priority over requests)
   */
  private processNextInQueue(): void {
    // Model changes have priority - process them first
    if (this.modelChangeQueue.length > 0 && this.isReadyToProcess()) {
      this.processModelChangeQueue();
      return;
    }

    // Then process regular requests
    if (this.queue.length > 0 && this.isReadyToProcess()) {
      this.processQueue();
      return;
    }
  }

  /**
   * Process the next request in the queue
   */
  private processQueue(): void {
    if (this.queue.length === 0 || !this.isReadyToProcess()) {
      return;
    }

    const request = this.queue.shift();
    if (request) {
      this.processRequest(request.id, request.messages)
        .then(request.resolve)
        .catch(request.reject);
    }
  }

  /**
   * Process the next model change in the queue
   */
  private processModelChangeQueue(): void {
    if (this.isBusy()) {
      return;
    }

    const modelChange = this.modelChangeQueue.shift();
    if (modelChange) {
      this.load(modelChange.config)
        .then(modelChange.resolve)
        .catch(modelChange.reject);
    }
  }

  /**
   * Interrupt current generation
   */
  interrupt(): void {
    if (this.llm && this.isLoaded && !this.isDeleted) {
      try {
        this.llm.interrupt();
      } catch (e) {
        console.error(`[LLMQueue] Failed to interrupt:`, e);
      }
    }
    // Clear current request but keep processing flag until generation actually stops
    // Don't clear currentRequestId immediately - let it clear in finally block
  }

  /**
   * Safely unload the LLM model, waiting for any ongoing operations
   * This is used internally when switching models
   * NOTE: Does NOT interrupt - waits for natural completion
   */
  private async safeUnload(): Promise<void> {
    // If already unloading, wait for it
    if (this.unloadPromise) {
      return this.unloadPromise;
    }

    this.unloadPromise = (async () => {
      // CRITICAL: Wait for processing to complete naturally
      // We DON'T interrupt because that would corrupt the current generation
      if (this.isProcessing) {
        // Wait for processing to complete (poll every 100ms, max 30 seconds)
        let attempts = 0;
        const maxAttempts = 300;
        while (this.isProcessing && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
        }

        if (this.isProcessing) {
          console.error(
            `[LLMQueue] Timeout waiting for processing to complete after 30 seconds`
          );
          // Even on timeout, DON'T interrupt - just log and proceed
          // The generation will eventually complete or error out
          // Unloading now might cause crashes but is safer than interrupting mid-generation
        }
      }

      // Now actually unload
      await this.doUnload();
    })();

    try {
      await this.unloadPromise;
    } finally {
      this.unloadPromise = null;
    }
  }

  /**
   * Actually perform the unload operation
   * NOTE: Should only be called after waiting for processing to complete
   */
  private async doUnload(): Promise<void> {
    // At this point, processing should be complete (we waited in safeUnload)
    // Don't interrupt - that contradicts the wait-for-completion approach

    // Clear queue and reject all pending requests
    this.queue.forEach((request) => {
      request.reject(new Error("LLM unloaded - request cancelled"));
    });
    this.queue = [];

    // Delete native instance
    if (this.llm) {
      try {
        this.llm.delete();
      } catch (e) {
        console.error(`[LLMQueue] Error deleting LLM:`, e);
      }
      this.llm = null;
    }

    this.isLoaded = false;
    this.isProcessing = false;
    this.currentRequestId = null;
    this.isDeleted = true;
    this.conversationCallbacks.clear();

    // Small delay to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Unload the LLM model to free memory
   * NOTE: Only called on app termination - we keep LLM loaded while app is alive
   */
  async unload(): Promise<void> {
    await this.safeUnload();
  }

  /**
   * Check if LLM is loaded
   */
  getIsLoaded(): boolean {
    return this.isLoaded && !this.isDeleted;
  }

  /**
   * Check if LLM is processing a request
   */
  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get current request ID
   */
  getCurrentRequestId(): string | null {
    return this.currentRequestId;
  }
}

// Singleton instance
export const llmQueue = new LLMQueueService();
