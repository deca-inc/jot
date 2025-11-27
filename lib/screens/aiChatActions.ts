/**
 * AI Chat Actions - Controller-like system for managing AI chat workflows
 *
 * This system provides a clean way to orchestrate complex workflows involving:
 * - Entry creation/updates
 * - AI generation
 * - Title generation
 * - Navigation
 *
 * Instead of scattered useEffects, we have clear action functions that can be
 * composed and chained together.
 */

import { Block } from "../db/entries";
import { llmQueue, llmManager, blocksToLlmMessages } from "../ai/ModelProvider";
import { TITLE_GENERATION_SYSTEM_PROMPT } from "../ai/modelConfig";
import { entryKeys } from "../db/useEntries";

/**
 * Strip <think> tags from AI response
 * Qwen models use these tags for reasoning, but we don't want them in the final output
 * @export Can be used throughout the app for cleaning Qwen responses
 */
export function stripThinkTags(text: string): string {
  const out = text
    .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove complete <think>...</think> blocks
    .replace(/<\/?think>/g, "") // Remove any remaining <think> or </think> tags
    .trim();

  return out;
}

export interface AIChatActionContext {
  // React Query mutations
  createEntry?: any; // Optional - not needed for all actions
  updateEntry: any;
  queryClient?: any; // React Query client for accessing cache

  // State setters (no-op in practice - React Query handles updates)
  setTitle: (title: string) => void;

  // LLM instance
  llm: any;

  // Model config (optional, for title generation)
  modelConfig?: any;

  // Callbacks
  onSave?: (entryId: number) => void;
}

interface InitialConversationParams {
  initialMessage: Block;
  title?: string;
}

interface CreateConversationParams {
  userMessage: string;
  createEntry: any;
  updateEntry: any;
  llmManager: any;
  modelConfig: any;
  queryClient?: any; // Optional - for cache updates
}

/**
 * Action: Create a new AI conversation from scratch
 *
 * Use this from HomeScreen or anywhere you need to create a new conversation.
 * This handles the complete flow and returns the entry ID for navigation.
 *
 * Flow:
 * 1. Create entry with user message
 * 2. Return entry ID immediately for navigation
 * 3. Queue AI response generation (runs in background)
 * 4. Generate title after AI response completes
 *
 * @returns The created entry ID
 */
export async function createConversation(
  params: CreateConversationParams
): Promise<number> {
  const {
    userMessage,
    createEntry,
    updateEntry,
    llmManager,
    modelConfig,
    queryClient,
  } = params;

  try {
    // Step 1: Create entry with user message
    const entry = await new Promise<any>((resolve, reject) => {
      createEntry.mutate(
        {
          type: "ai_chat",
          title: "AI Conversation",
          blocks: [
            {
              type: "markdown",
              content: userMessage.trim(),
              role: "user",
            },
          ],
          tags: [],
          attachments: [],
          isFavorite: false,
        },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });

    // Step 2: Queue background work (don't await - let it run async)
    queueBackgroundGeneration(
      entry.id,
      userMessage,
      entry.blocks,
      updateEntry,
      llmManager,
      modelConfig,
      queryClient
    ).catch((error) => {
      console.error(
        `[AIChat Action] Background generation error for entry ${entry.id}:`,
        error
      );
      console.error(
        `[AIChat Action] Background generation error stack:`,
        error instanceof Error ? error.stack : "No stack"
      );
    });

    // Step 3: Return entry ID for immediate navigation
    return entry.id;
  } catch (error) {
    console.error("[AIChat Action] Error creating conversation:", error);
    throw error;
  }
}

/**
 * Queue AI generation and title generation to run in background
 */
async function queueBackgroundGeneration(
  entryId: number,
  userMessage: string,
  blocks: Block[],
  updateEntry: any,
  llmManager: any,
  modelConfig: any,
  queryClient?: any
): Promise<void> {
  try {
    const convoId = `entry-${entryId}`;

    // Mark generation as started and add placeholder assistant block
    try {
      // Use mutateAsync instead of mutate to get a proper promise
      await updateEntry.mutateAsync({
        id: entryId,
        input: {
          blocks: [
            ...blocks,
            {
              type: "markdown" as const,
              content: "",
              role: "assistant" as const,
            },
          ],
          generationStatus: "generating",
          generationStartedAt: Date.now(),
          generationModelId: modelConfig?.modelId || null,
        },
      });
    } catch (updateError) {
      console.error(
        `[AIChat Action] Failed to mark generation as started for entry ${entryId}:`,
        updateError
      );
      throw updateError; // Re-throw to prevent continuing if this fails
    }

    // Set up listeners for streaming updates - these handle ALL database writes
    // This ensures generation continues even when component unmounts
    let lastFullResponse = "";
    let tokenCount = 0;
    let lastWriteTime = Date.now();
    const DEBOUNCE_MS = 500; // Write to DB every 500ms

    const listeners = {
      onToken: async (token: string) => {
        tokenCount++;
        lastFullResponse += token;

        // Debounced writes every 500ms or every 100 chars
        const now = Date.now();
        const shouldWrite =
          now - lastWriteTime >= DEBOUNCE_MS ||
          lastFullResponse.length % 100 === 0;

        if (shouldWrite) {
          try {
            const updatedBlocks = [
              ...blocks,
              {
                type: "markdown" as const,
                content: lastFullResponse,
                role: "assistant" as const,
              },
            ];
            await updateEntry.mutateAsync({
              id: entryId,
              input: { blocks: updatedBlocks },
            });
            lastWriteTime = now;
          } catch (e) {
            console.warn("[AIChat Action] Failed to stream update:", e);
          }
        }
      },
      onMessageHistoryUpdate: async (messages: any[]) => {
        try {
          const updatedBlocks = messages
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({
              type: "markdown" as const,
              content: m.content,
              role: m.role as "user" | "assistant",
            }));

          // Final write with complete message history
          // CRITICAL: Get current entry from database to preserve title if it was already set
          // This prevents overwriting a title that was generated
          let currentTitle: string | undefined = undefined;

          // First try to get from cache
          if (queryClient) {
            try {
              const currentEntry = queryClient.getQueryData(
                entryKeys.detail(entryId)
              );
              if (
                currentEntry?.title &&
                currentEntry.title !== "AI Conversation"
              ) {
                currentTitle = currentEntry.title;
              }
            } catch (e) {
              console.warn("[AIChat Action] Error reading cache:", e);
            }
          }

          const updateInput: any = {
            blocks: updatedBlocks,
          };

          // CRITICAL: Only include title if we have a non-default one to preserve
          // If we don't include title, the update method will preserve the existing database title
          // This prevents overwriting a title that was generated but not yet in cache
          if (currentTitle) {
            updateInput.title = currentTitle;
          }

          await updateEntry.mutateAsync({
            id: entryId,
            input: updateInput,
          });

          // CRITICAL: The update method returns the entry from the database
          // If we didn't include title in the update, it preserved the existing DB title
          // The cache will be updated by the mutation's onSuccess callback with the returned entry
          // So the cache should now have the correct title from the database
        } catch (e) {
          console.warn("[AIChat Action] Failed to write message history:", e);
        }
      },
    };

    // Generate AI response
    let llmForConvo;
    try {
      llmForConvo = await llmManager.getOrCreate(
        convoId,
        modelConfig,
        listeners,
        undefined
      );
    } catch (getOrCreateError) {
      console.error(
        `[AIChat Action] Failed to getOrCreate LLM for entry ${entryId}:`,
        getOrCreateError
      );
      throw getOrCreateError;
    }

    const messages = blocksToLlmMessages(blocks);

    const aiResponse = await llmForConvo.generate(messages);

    // Mark generation as completed
    try {
      await updateEntry.mutateAsync({
        id: entryId,
        input: {
          generationStatus: "completed",
        },
      });
    } catch (updateError) {
      console.error(
        "[AIChat Action] Failed to mark generation as completed:",
        updateError
      );
      // Don't block title generation if this fails
    }

    // Generate title after AI response completes
    // IMPORTANT: Do this AFTER onMessageHistoryUpdate has had a chance to fire
    // We'll add a small delay to ensure the callback has completed
    if (userMessage) {
      // Small delay to ensure onMessageHistoryUpdate has completed
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        await generateTitle(
          userMessage,
          entryId,
          {
            updateEntry,
            setTitle: () => {}, // No-op
            llm: llmForConvo, // Use the same LLM instance for title generation
            onSave: undefined,
            modelConfig: modelConfig, // Pass model config for title generation
            queryClient: queryClient, // Pass query client for cache updates
          },
          aiResponse
        );
      } catch (titleError) {
        console.error(
          `[AIChat Action] Title generation failed for entry ${entryId}:`,
          titleError
        );
        // Don't throw - title generation is non-critical
      }
    }
  } catch (error) {
    console.error(
      `[AIChat Action] Background generation failed for entry ${entryId}:`,
      error
    );

    // Mark generation as failed
    try {
      await new Promise<void>((resolve, reject) => {
        updateEntry.mutate(
          {
            id: entryId,
            input: {
              generationStatus: "failed",
            },
          },
          {
            onSuccess: () => resolve(),
            onError: reject,
          }
        );
      });
    } catch (updateError) {
      console.error(
        "[AIChat Action] Failed to mark generation as failed:",
        updateError
      );
    }
  }
}

/**
 * Action: Initialize a new AI conversation (legacy - used by AIChatComposer)
 *
 * This handles the complete flow:
 * 1. Create entry with initial message
 * 2. Generate AI response
 * 3. Generate title based on user's first message
 * 4. Trigger navigation
 */
export async function initializeAIConversation(
  params: InitialConversationParams,
  context: AIChatActionContext
): Promise<void> {
  const { initialMessage, title = "AI Conversation" } = params;
  const { createEntry, onSave } = context;

  try {
    // Step 1: Create entry with initial message
    const entry = await new Promise<any>((resolve, reject) => {
      createEntry!.mutate(
        {
          type: "ai_chat",
          title,
          blocks: [initialMessage],
          tags: [],
          attachments: [],
          isFavorite: false,
        },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });

    // Step 2: Trigger navigation early so user sees the conversation
    onSave?.(entry.id);

    // Step 3: Generate AI response
    const aiResponseContent = await generateAIResponse(
      [initialMessage],
      context,
      entry.id,
      undefined // modelId will be set from context if needed
    );

    // Step 4: Generate title based on first message and AI response
    const firstMessageContent =
      initialMessage.type === "markdown" ? initialMessage.content : "";
    if (firstMessageContent) {
      await generateTitle(
        firstMessageContent,
        entry.id,
        context,
        aiResponseContent
      );
    }

    console.log("[AIChat Action] Conversation initialized successfully");
  } catch (error) {
    console.error("[AIChat Action] Error initializing conversation:", error);
    throw error;
  }
}

/**
 * Action: Generate AI response for given messages
 *
 * This function:
 * 1. Adds a placeholder assistant message to the entry
 * 2. Sets up streaming listeners that write to the database
 * 3. Calls llm.generate() which streams tokens
 * 4. Returns the generated content
 *
 * @returns The generated AI response content
 */
export async function generateAIResponse(
  messages: Block[],
  context: AIChatActionContext,
  entryId?: number,
  modelId?: string
): Promise<string> {
  const { llm, updateEntry } = context;

  if (!llm) {
    throw new Error("LLM not ready");
  }

  if (!entryId) {
    throw new Error("entryId is required for generateAIResponse");
  }

  try {
    // Get current blocks from React Query cache or use provided messages
    let currentBlocks = messages;
    if (context.queryClient) {
      const cachedEntry = context.queryClient.getQueryData(
        entryKeys.detail(entryId)
      );
      if (cachedEntry?.blocks) {
        currentBlocks = cachedEntry.blocks;
      }
    }

    // Add placeholder assistant message to the entry
    const placeholderMessage: Block = {
      type: "markdown",
      content: "",
      role: "assistant",
    };

    // Add placeholder to entry and mark generation as started
    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            blocks: [...currentBlocks, placeholderMessage],
            generationStatus: "generating",
            generationStartedAt: Date.now(),
            generationModelId: modelId || null,
          },
        },
        {
          onSuccess: () => resolve(),
          onError: reject,
        }
      );
    });

    // Set up listeners for streaming updates - these handle ALL database writes
    let lastFullResponse = "";
    let tokenCount = 0;
    let lastWriteTime = Date.now();
    const DEBOUNCE_MS = 500; // Write to DB every 500ms

    const listeners = {
      onToken: async (token: string) => {
        tokenCount++;
        lastFullResponse += token;

        // Debounced writes every 500ms or every 100 chars
        const now = Date.now();
        const shouldWrite =
          now - lastWriteTime >= DEBOUNCE_MS ||
          lastFullResponse.length % 100 === 0;

        if (shouldWrite) {
          try {
            // Get current blocks from React Query cache to preserve any updates
            let currentEntryBlocks = currentBlocks;
            if (context.queryClient) {
              const cachedEntry = context.queryClient.getQueryData(
                entryKeys.detail(entryId)
              );
              if (cachedEntry?.blocks) {
                currentEntryBlocks = cachedEntry.blocks;
              }
            }

            // Update the last block (assistant block) with new content
            const updatedBlocks = [...currentEntryBlocks];
            const lastBlock = updatedBlocks[updatedBlocks.length - 1];

            if (
              lastBlock &&
              lastBlock.role === "assistant" &&
              lastBlock.type === "markdown"
            ) {
              updatedBlocks[updatedBlocks.length - 1] = {
                type: "markdown" as const,
                content: lastFullResponse,
                role: "assistant" as const,
              };
            } else {
              // Add new assistant block if it doesn't exist
              updatedBlocks.push({
                type: "markdown" as const,
                content: lastFullResponse,
                role: "assistant" as const,
              });
            }

            await updateEntry.mutateAsync({
              id: entryId,
              input: { blocks: updatedBlocks },
            });
            lastWriteTime = now;
          } catch (e) {
            console.warn("[AIChat Action] Failed to stream update:", e);
          }
        }
      },
      onMessageHistoryUpdate: async (messages: any[]) => {
        try {
          const updatedBlocks = messages
            .filter((m: any) => m.role !== "system")
            .map((m: any) => ({
              type: "markdown" as const,
              content: m.content,
              role: m.role as "user" | "assistant",
            }));

          // Final write with complete message history
          // CRITICAL: Get current entry to preserve title if it was already set
          // This prevents overwriting a title that was generated
          let currentTitle: string | undefined = undefined;
          if (context.queryClient) {
            try {
              const currentEntry = context.queryClient.getQueryData(
                entryKeys.detail(entryId)
              );
              if (
                currentEntry?.title &&
                currentEntry.title !== "AI Conversation"
              ) {
                currentTitle = currentEntry.title;
              }
            } catch (e) {
              // Ignore cache errors
            }
          }

          await updateEntry.mutateAsync({
            id: entryId,
            input: {
              blocks: updatedBlocks,
              // Only include title if we have a non-default one to preserve
              ...(currentTitle ? { title: currentTitle } : {}),
            },
          });
        } catch (e) {
          console.warn("[AIChat Action] Failed to write message history:", e);
        }
      },
    };

    // Register listeners with the LLM instance
    const convoId = `entry-${entryId}`;

    // Re-register listeners for this conversation
    // Note: This assumes the llm instance is already created
    llmManager.registerListeners(convoId, listeners);

    // Also register with the queue directly
    llmQueue.registerCallbacks(convoId, listeners);

    // Convert blocks to LLM messages
    const llmMessages = blocksToLlmMessages(currentBlocks);

    // Generate response - this will stream tokens and update the DB via listeners
    const generatedContent = await llm.generate(llmMessages);

    // Mark generation as completed
    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            generationStatus: "completed",
          },
        },
        {
          onSuccess: () => resolve(),
          onError: reject,
        }
      );
    });

    return generatedContent;
  } catch (error) {
    console.error("[AIChat Action] Error generating AI response:", error);

    // Mark generation as failed
    try {
      await new Promise<void>((resolve, reject) => {
        updateEntry.mutate(
          {
            id: entryId,
            input: {
              generationStatus: "failed",
            },
          },
          {
            onSuccess: () => resolve(),
            onError: reject,
          }
        );
      });
    } catch (updateError) {
      console.error(
        "[AIChat Action] Failed to mark generation as failed:",
        updateError
      );
    }

    throw error;
  }
}

/**
 * Action: Generate a title for the conversation
 *
 * @param userMessage - The user's first message
 * @param aiResponse - Optional AI response to include in context
 * @param entryId - The entry ID
 * @param context - Action context
 */
export async function generateTitle(
  userMessage: string,
  entryId: number,
  context: AIChatActionContext,
  aiResponse?: string
): Promise<void> {
  const { updateEntry, setTitle, onSave } = context;

  try {
    // Strip out <think> tags from AI response before using for title generation
    const cleanedAiResponse = aiResponse
      ? stripThinkTags(aiResponse)
      : undefined;

    // Create title generation prompt with context
    let promptContent = `Generate a specific, memorable title (3-6 words) that captures the main topic of this conversation. The title should help the user remember what was discussed.

User: "${userMessage}"`;
    if (cleanedAiResponse && cleanedAiResponse.length > 0) {
      // Include AI response for better context, but truncate if too long
      const truncatedResponse =
        cleanedAiResponse.length > 200
          ? cleanedAiResponse.substring(0, 200) + "..."
          : cleanedAiResponse;
      promptContent += `\n\nAssistant: "${truncatedResponse}"`;
    }

    promptContent += `\n\nCreate a title that is:
- Specific to the actual content (not generic like "AI Question" or "Chat")
- Captures the key topic or subject matter
- Helps identify this conversation from others
- 3-6 words max
- Plain text only (no markdown, no quotes, no formatting)

Respond with ONLY the title text, nothing else.

Title:`;

    const titlePrompt: Block[] = [
      {
        type: "markdown",
        content: promptContent,
        role: "user",
      },
    ];

    const messages = blocksToLlmMessages(
      titlePrompt,
      TITLE_GENERATION_SYSTEM_PROMPT
    );

    // Use separate conversation ID for title generation to avoid interfering with main chat
    const titleConvoId = `title-gen-${entryId}-${Date.now()}`;

    // Ensure model is loaded before generating title
    if (!context.modelConfig) {
      console.error(
        "[AIChat Action] No model config provided for title generation"
      );
      throw new Error("Model config is required for title generation");
    }
    // Ensure model is loaded with the same config
    // This will reuse the existing model if it's already loaded
    await llmManager.getOrCreate(
      titleConvoId,
      context.modelConfig,
      undefined, // No listeners needed for title generation
      undefined
    );

    // Queue title generation - this will wait for any ongoing generation to complete
    const generatedTitle = await llmQueue.generate(titleConvoId, messages);

    // Clean up the title
    let cleanTitle = stripThinkTags(generatedTitle) // Remove <think> tags first
      // Remove markdown formatting
      .replace(/\*\*/g, "") // Remove bold markers
      .replace(/\*/g, "") // Remove italic markers
      .replace(/^#+\s*/g, "") // Remove heading markers
      .replace(/`/g, "") // Remove code markers
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(
        /^(Title|Conversation Title|Chat Title|Response|Here's a title|Here is a title):\s*/i,
        ""
      )
      .replace(/\n.*/g, "") // Remove everything after first newline
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    // Limit length to 60 chars for more specific titles
    if (cleanTitle.length > 60) {
      cleanTitle = cleanTitle.substring(0, 57) + "...";
    }

    // If title is empty after cleaning (e.g., only had think tags), use fallback
    if (cleanTitle.length === 0) {
      console.warn(
        "[AIChat Action] Generated title was empty after cleaning, using fallback"
      );
      // Generate a simple fallback from user message
      cleanTitle =
        userMessage.slice(0, 40) + (userMessage.length > 40 ? "..." : "");
    }

    if (cleanTitle.length > 0) {
      // Save to database
      await new Promise<void>((resolve, reject) => {
        updateEntry.mutate(
          {
            id: entryId,
            input: { title: cleanTitle },
          },
          {
            onSuccess: () => {
              // Also update React Query cache immediately to ensure UI updates
              if (context.queryClient) {
                try {
                  const currentEntry = context.queryClient.getQueryData(
                    entryKeys.detail(entryId)
                  );
                  if (currentEntry) {
                    context.queryClient.setQueryData(
                      entryKeys.detail(entryId),
                      {
                        ...currentEntry,
                        title: cleanTitle,
                      }
                    );
                  }
                } catch (cacheError) {
                  console.warn(
                    "[AIChat Action] Failed to update cache:",
                    cacheError
                  );
                }
              }

              onSave?.(entryId);
              resolve();
            },
            onError: (error: any) => {
              console.error(
                `[AIChat Action] Failed to save title to entry ${entryId}:`,
                error
              );
              reject(error);
            },
          }
        );
      });
    }
  } catch (error) {
    console.error("[AIChat Action] Error generating title:", error);
    // Don't throw - title generation is non-critical
  }
}

/**
 * Action: Send a new message and generate response
 *
 * Flow:
 * 1. Add user message to entry (create or update)
 * 2. Trigger navigation if new entry
 * 3. Queue AI response generation (runs in background)
 * 4. Generate title if first message
 */
export async function sendMessageWithResponse(
  message: string,
  entryId: number | undefined,
  currentMessages: Block[],
  currentTitle: string,
  context: AIChatActionContext
): Promise<number> {
  const { createEntry, updateEntry, onSave } = context;

  const userMessage: Block = {
    type: "markdown",
    content: message.trim(),
    role: "user",
  };

  const updatedMessages = [...currentMessages, userMessage];
  const finalTitle = currentTitle.trim() || "AI Conversation";
  let finalEntryId = entryId;

  // Save the user message to the entry
  if (entryId) {
    // Update existing entry
    await new Promise<void>((resolve, reject) => {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            title: finalTitle,
            blocks: updatedMessages,
          },
        },
        {
          onSuccess: () => {
            onSave?.(entryId);
            resolve();
          },
          onError: reject,
        }
      );
    });
  } else {
    // Create new entry
    const entry = await new Promise<any>((resolve, reject) => {
      createEntry!.mutate(
        {
          type: "ai_chat",
          title: finalTitle,
          blocks: updatedMessages,
          tags: [],
          attachments: [],
          isFavorite: false,
        },
        {
          onSuccess: resolve,
          onError: reject,
        }
      );
    });

    finalEntryId = entry.id;
    // Trigger navigation immediately - generation will happen in background
    onSave?.(entry.id);
  }

  // Generate AI response in background
  const aiResponseContent = await generateAIResponse(
    updatedMessages,
    context,
    finalEntryId,
    undefined // modelId will be set from context if needed
  );

  // Generate title if this is the first message (only user message, no assistant response yet)
  const isFirstMessage =
    currentMessages.filter((m) => m.role === "user").length === 1;
  if (isFirstMessage) {
    await generateTitle(message, finalEntryId!, context, aiResponseContent);
  }

  return finalEntryId!;
}
