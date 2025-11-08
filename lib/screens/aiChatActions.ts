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
import { llmQueue } from "../ai/ModelProvider";

export interface AIChatActionContext {
  // React Query mutations
  createEntry?: any; // Optional - not needed for all actions
  updateEntry: any;

  // State setters (local input state only)
  setTitle: (title: string) => void;

  // LLM instance
  llm: any;

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
  const { userMessage, createEntry, updateEntry, llmManager, modelConfig } =
    params;

  try {
    console.log("[AIChat Action] Creating new conversation");

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

    console.log("[AIChat Action] Created entry:", entry.id);

    // Step 2: Queue background work (don't await - let it run async)
    queueBackgroundGeneration(
      entry.id,
      userMessage,
      entry.blocks,
      updateEntry,
      llmManager,
      modelConfig
    );

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
  modelConfig: any
): Promise<void> {
  try {
    const convoId = `entry-${entryId}`;

    // Set up listeners for streaming updates
    let lastFullResponse = "";
    const listeners = {
      onToken: async (token: string) => {
        lastFullResponse += token;
        // Debounced writes every 100 chars
        if (lastFullResponse.length % 100 === 0) {
          try {
            const updatedBlocks = [
              ...blocks,
              {
                type: "markdown" as const,
                content: lastFullResponse,
                role: "assistant" as const,
              },
            ];
            updateEntry.mutate({
              id: entryId,
              input: { blocks: updatedBlocks },
            });
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
          updateEntry.mutate({
            id: entryId,
            input: { blocks: updatedBlocks },
          });
        } catch (e) {
          console.warn("[AIChat Action] Failed to write message history:", e);
        }
      },
    };

    // Generate AI response
    const llmForConvo = await llmManager.getOrCreate(
      convoId,
      modelConfig,
      listeners,
      undefined
    );

    const { blocksToLlmMessages } = require("../ai/ModelProvider");
    const messages = blocksToLlmMessages(
      blocks,
      "You are a helpful AI assistant."
    );

    const aiResponse = await llmForConvo.generate(messages);
    console.log("[AIChat Action] AI response generated for entry:", entryId);

    // Generate title after AI response completes
    if (userMessage) {
      await generateTitle(
        userMessage,
        entryId,
        {
          updateEntry,
          setTitle: () => {}, // No-op
          llm: null,
          onSave: undefined,
        },
        aiResponse
      );
    }

    console.log(
      "[AIChat Action] Background generation completed for entry:",
      entryId
    );
  } catch (error) {
    console.error("[AIChat Action] Background generation failed:", error);
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
    console.log("[AIChat Action] Initializing new conversation");

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

    console.log("[AIChat Action] Created entry:", entry.id);

    // Step 2: Trigger navigation early so user sees the conversation
    onSave?.(entry.id);

    // Step 3: Generate AI response
    console.log("[AIChat Action] Generating AI response");
    const aiResponseContent = await generateAIResponse(
      [initialMessage],
      context,
      entry.id
    );

    // Step 4: Generate title based on first message and AI response
    const firstMessageContent =
      initialMessage.type === "markdown" ? initialMessage.content : "";
    if (firstMessageContent) {
      console.log("[AIChat Action] Generating title with AI response context");
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
 * 2. Calls llm.generate() which streams tokens and updates the DB
 * 3. Returns the generated content
 *
 * @returns The generated AI response content
 */
export async function generateAIResponse(
  messages: Block[],
  context: AIChatActionContext,
  entryId?: number
): Promise<string> {
  const { llm, updateEntry } = context;

  if (!llm) {
    throw new Error("LLM not ready");
  }

  try {
    // Add placeholder assistant message to the entry
    const placeholderMessage: Block = {
      type: "markdown",
      content: "",
      role: "assistant",
    };

    if (entryId) {
      // Add placeholder to entry so UI shows "Thinking..."
      await new Promise<void>((resolve, reject) => {
        updateEntry.mutate(
          {
            id: entryId,
            input: {
              blocks: [...messages, placeholderMessage],
            },
          },
          {
            onSuccess: () => resolve(),
            onError: reject,
          }
        );
      });
    }

    // Convert blocks to LLM messages
    const { blocksToLlmMessages } = require("../ai/ModelProvider");
    const llmMessages = blocksToLlmMessages(
      messages,
      "You are a helpful AI assistant."
    );

    // Generate response - this will stream tokens and update the DB
    // The LLM hook's onToken callback handles database updates during streaming
    const generatedContent = await llm.generate(llmMessages);

    console.log("[AIChat Action] AI response generated");

    return generatedContent;
  } catch (error) {
    console.error("[AIChat Action] Error generating AI response:", error);
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

  console.log("[AIChat Action] Generating title for entry:", entryId);

  try {
    // Create title generation prompt with context
    let promptContent = `Generate a specific, memorable title (3-6 words) that captures the main topic of this conversation. The title should help the user remember what was discussed.

User: "${userMessage}"`;
    if (aiResponse) {
      // Include AI response for better context, but truncate if too long
      const truncatedResponse =
        aiResponse.length > 200
          ? aiResponse.substring(0, 200) + "..."
          : aiResponse;
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

    const { blocksToLlmMessages } = require("../ai/ModelProvider");
    const messages = blocksToLlmMessages(
      titlePrompt,
      "You are a helpful AI assistant that generates specific, memorable titles for conversations. Return ONLY plain text titles with no markdown formatting, quotes, or special characters."
    );

    // Use separate conversation ID for title generation to avoid interfering with main chat
    const titleConvoId = `title-gen-${entryId}-${Date.now()}`;
    const generatedTitle = await llmQueue.generate(titleConvoId, messages);

    // Clean up the title
    let cleanTitle = generatedTitle
      .trim()
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

    if (cleanTitle.length > 0) {
      console.log("[AIChat Action] Generated title:", cleanTitle);
      setTitle(cleanTitle);

      // Save to database
      await new Promise<void>((resolve, reject) => {
        updateEntry.mutate(
          {
            id: entryId,
            input: { title: cleanTitle },
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
    console.log("[AIChat Action] Created new entry:", entry.id);

    // Trigger navigation immediately - generation will happen in background
    onSave?.(entry.id);
  }

  // Generate AI response in background
  const aiResponseContent = await generateAIResponse(
    updatedMessages,
    context,
    finalEntryId
  );

  // Generate title if this is the first message
  if (currentMessages.length === 0) {
    await generateTitle(message, finalEntryId!, context, aiResponseContent);
  }

  return finalEntryId!;
}
