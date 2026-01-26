/**
 * Remote API Client
 *
 * OpenAI-compatible API client for remote model inference.
 * Supports OpenAI, Anthropic, Groq, and custom servers.
 *
 * Features:
 * - Non-streaming and streaming chat completions
 * - Anthropic-specific header handling (x-api-key, anthropic-version)
 * - Error handling with user-friendly messages
 * - AbortController support for cancellation
 *
 * Note: Uses expo/fetch for streaming support in React Native.
 * The standard fetch in React Native doesn't support ReadableStream.
 */

import { fetch } from "expo/fetch";
import { getApiStyleConfig, type ApiStyle } from "./customModels";

// =============================================================================
// TYPES
// =============================================================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RemoteApiConfig {
  /** API style determines auth format and endpoints */
  apiStyle: ApiStyle;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  customHeaders?: Record<string, string>;
}

export interface SendMessageOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface StreamingOptions extends SendMessageOptions {
  responseCallback?: (responseSoFar: string) => void;
  completeCallback?: (result: string) => void;
}

// =============================================================================
// ERROR CLASS
// =============================================================================

export class RemoteApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}

// =============================================================================
// API CLIENT
// =============================================================================

export class RemoteApiClient {
  private config: RemoteApiConfig;

  constructor(config: RemoteApiConfig) {
    this.config = config;
  }

  /**
   * Send a chat message and get a complete response (non-streaming).
   */
  async sendMessage(
    messages: ChatMessage[],
    options?: SendMessageOptions,
  ): Promise<string> {
    const isAnthropic = this.config.apiStyle === "anthropic";

    if (isAnthropic) {
      return this.sendAnthropicMessage(messages, options);
    }

    return this.sendOpenAICompatibleMessage(messages, options);
  }

  /**
   * Send a chat message and stream the response.
   */
  async sendMessageStreaming(
    messages: ChatMessage[],
    options?: StreamingOptions,
  ): Promise<string> {
    const isAnthropic = this.config.apiStyle === "anthropic";

    if (isAnthropic) {
      return this.streamAnthropicMessage(messages, options);
    }

    return this.streamOpenAICompatibleMessage(messages, options);
  }

  // ===========================================================================
  // OPENAI-COMPATIBLE API
  // ===========================================================================

  private async sendOpenAICompatibleMessage(
    messages: ChatMessage[],
    options?: SendMessageOptions,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const headers = this.buildOpenAIHeaders();

    // Prepend system message if provided
    const allMessages = options?.systemPrompt
      ? [
          { role: "system" as const, content: options.systemPrompt },
          ...messages,
        ]
      : messages;

    const body = {
      model: this.config.modelName,
      messages: allMessages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      stream: false,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  private async streamOpenAICompatibleMessage(
    messages: ChatMessage[],
    options?: StreamingOptions,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const headers = this.buildOpenAIHeaders();

    // Prepend system message if provided
    const allMessages = options?.systemPrompt
      ? [
          { role: "system" as const, content: options.systemPrompt },
          ...messages,
        ]
      : messages;

    const body = {
      model: this.config.modelName,
      messages: allMessages,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return this.processStreamResponse(response, options);
  }

  private buildOpenAIHeaders(): Record<string, string> {
    return this.buildHeaders("openai-compatible");
  }

  // ===========================================================================
  // ANTHROPIC API
  // ===========================================================================

  private async sendAnthropicMessage(
    messages: ChatMessage[],
    options?: SendMessageOptions,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/messages`;
    const headers = this.buildAnthropicHeaders();

    // Filter out system messages for the messages array
    const chatMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      messages: chatMessages,
      max_tokens: options?.maxTokens || 4096,
    };

    // Add system prompt if provided
    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return this.parseAnthropicResponse(data);
  }

  private async streamAnthropicMessage(
    messages: ChatMessage[],
    options?: StreamingOptions,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/messages`;
    const headers = this.buildAnthropicHeaders();

    // Filter out system messages for the messages array
    const chatMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      messages: chatMessages,
      max_tokens: options?.maxTokens || 4096,
      stream: true,
    };

    // Add system prompt if provided
    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.abortSignal,
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return this.processAnthropicStreamResponse(response, options);
  }

  private buildAnthropicHeaders(): Record<string, string> {
    return this.buildHeaders("anthropic");
  }

  /**
   * Build headers based on API style configuration.
   */
  private buildHeaders(apiStyle: ApiStyle): Record<string, string> {
    const styleConfig = getApiStyleConfig(apiStyle);
    if (!styleConfig) {
      throw new Error(`Unknown API style: ${apiStyle}`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth header based on style config (only if API key is provided)
    if (this.config.apiKey) {
      if (styleConfig.authFormat === "bearer") {
        headers[styleConfig.authHeader] = `Bearer ${this.config.apiKey}`;
      } else {
        headers[styleConfig.authHeader] = this.config.apiKey;
      }
    }

    // Add default headers from style (e.g., anthropic-version)
    if (styleConfig.defaultHeaders) {
      Object.assign(headers, styleConfig.defaultHeaders);
    }

    // Add custom headers
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  private parseAnthropicResponse(data: {
    content: Array<{ type: string; text?: string }>;
  }): string {
    // Anthropic returns content as an array of content blocks
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("");
  }

  // ===========================================================================
  // STREAM PROCESSING
  // ===========================================================================

  private async processStreamResponse(
    response: Response,
    options?: StreamingOptions,
  ): Promise<string> {
    const reader = response.body?.getReader();

    // React Native's fetch doesn't support ReadableStream.getReader()
    // Fall back to reading the full response as text
    if (!reader) {
      return this.processStreamResponseFallback(response, options);
    }

    const decoder = new TextDecoder();
    let fullResponse = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                options?.responseCallback?.(fullResponse);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    options?.completeCallback?.(fullResponse);
    return fullResponse;
  }

  /**
   * Fallback for environments where ReadableStream is not available (React Native).
   * Reads the full SSE response and parses all chunks at once.
   */
  private async processStreamResponseFallback(
    response: Response,
    options?: StreamingOptions,
  ): Promise<string> {
    const text = await response.text();
    let fullResponse = "";

    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Call callbacks with final result (no streaming in fallback mode)
    options?.responseCallback?.(fullResponse);
    options?.completeCallback?.(fullResponse);
    return fullResponse;
  }

  private async processAnthropicStreamResponse(
    response: Response,
    options?: StreamingOptions,
  ): Promise<string> {
    const reader = response.body?.getReader();

    // React Native's fetch doesn't support ReadableStream.getReader()
    // Fall back to reading the full response as text
    if (!reader) {
      return this.processAnthropicStreamResponseFallback(response, options);
    }

    const decoder = new TextDecoder();
    let fullResponse = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data);
              // Anthropic streaming format
              if (parsed.type === "content_block_delta") {
                const text = parsed.delta?.text;
                if (text) {
                  fullResponse += text;
                  options?.responseCallback?.(fullResponse);
                }
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    options?.completeCallback?.(fullResponse);
    return fullResponse;
  }

  /**
   * Fallback for Anthropic streaming in environments where ReadableStream is not available.
   * Reads the full SSE response and parses all chunks at once.
   */
  private async processAnthropicStreamResponseFallback(
    response: Response,
    options?: StreamingOptions,
  ): Promise<string> {
    const text = await response.text();
    let fullResponse = "";

    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);

        try {
          const parsed = JSON.parse(data);
          // Anthropic streaming format
          if (parsed.type === "content_block_delta") {
            const text = parsed.delta?.text;
            if (text) {
              fullResponse += text;
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Call callbacks with final result (no streaming in fallback mode)
    options?.responseCallback?.(fullResponse);
    options?.completeCallback?.(fullResponse);
    return fullResponse;
  }

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    let errorDetails: unknown;

    try {
      const errorData = await response.json();
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
      errorDetails = errorData;
    } catch {
      // Ignore JSON parsing errors
    }

    throw new RemoteApiError(errorMessage, response.status, errorDetails);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a RemoteApiClient from model config and API key.
 */
export function createRemoteApiClient(
  apiStyle: ApiStyle,
  baseUrl: string,
  modelName: string,
  apiKey: string,
  customHeaders?: Record<string, string>,
): RemoteApiClient {
  return new RemoteApiClient({
    apiStyle,
    baseUrl,
    modelName,
    apiKey,
    customHeaders,
  });
}
