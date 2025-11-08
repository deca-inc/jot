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
  createEntry: any;
  updateEntry: any;

  // State setters
  setTitle: (title: string) => void;
  setChatMessages: React.Dispatch<React.SetStateAction<Block[]>>;

  // LLM instance
  llm: any;

  // Callbacks
  onSave?: (entryId: number) => void;

  // Refs for tracking state
  hasGeneratedTitleRef: { current: boolean };
  actualEntryIdRef: { current: number | undefined };
  isGeneratingRef: { current: boolean };
  generatingMessageIndexRef: { current: number | null };
}

interface InitialConversationParams {
  initialMessage: Block;
  title?: string;
}

/**
 * Action: Initialize a new AI conversation
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
  const { createEntry, onSave, actualEntryIdRef } = context;

  try {
    console.log("[AIChat Action] Initializing new conversation");

    // Step 1: Create entry with initial message
    const entry = await new Promise<any>((resolve, reject) => {
      createEntry.mutate(
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
    actualEntryIdRef.current = entry.id;

    // Step 2: Trigger navigation early so user sees the conversation
    onSave?.(entry.id);

    // Step 3: Generate AI response
    console.log("[AIChat Action] Generating AI response");
    const aiResponseContent = await generateAIResponse(
      [initialMessage],
      context
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
 * @returns The generated AI response content
 */
export async function generateAIResponse(
  messages: Block[],
  context: AIChatActionContext
): Promise<string> {
  const { llm, isGeneratingRef, generatingMessageIndexRef, setChatMessages } =
    context;

  if (!llm) {
    throw new Error("LLM not ready");
  }

  try {
    isGeneratingRef.current = true;

    // Add placeholder assistant message
    const placeholderIndex = messages.length;
    generatingMessageIndexRef.current = placeholderIndex;

    const placeholderMessage: Block = {
      type: "markdown",
      content: "",
      role: "assistant",
    };

    setChatMessages((prev) => [...prev, placeholderMessage]);

    // Convert blocks to LLM messages
    const { blocksToLlmMessages } = require("../ai/ModelProvider");
    const llmMessages = blocksToLlmMessages(
      messages,
      "You are a helpful AI assistant."
    );

    // Generate response
    await llm.generate(llmMessages);

    console.log("[AIChat Action] AI response generated");

    // Capture the generated response content from state
    // After generation, the LLM hook updates the entry and syncs to state
    let generatedContent = "";
    setChatMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        lastMessage.type === "markdown"
      ) {
        generatedContent = lastMessage.content;
      }
      return prev; // Don't modify state, just read
    });

    return generatedContent;
  } catch (error) {
    console.error("[AIChat Action] Error generating AI response:", error);
    // Remove placeholder on error
    setChatMessages((prev) => prev.slice(0, -1));
    throw error;
  } finally {
    isGeneratingRef.current = false;
    generatingMessageIndexRef.current = null;
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
  const { updateEntry, setTitle, hasGeneratedTitleRef, onSave } = context;

  // Don't generate if we've already generated a title
  if (hasGeneratedTitleRef.current) {
    console.log("[AIChat Action] Title already generated, skipping");
    return;
  }

  hasGeneratedTitleRef.current = true;

  try {
    console.log("[AIChat Action] Generating title for entry:", entryId);

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
      "You are a helpful AI assistant that generates specific, memorable titles for conversations. Focus on the actual content and key topics discussed."
    );

    // Use separate conversation ID for title generation to avoid interfering with main chat
    const titleConvoId = `title-gen-${entryId}-${Date.now()}`;
    const generatedTitle = await llmQueue.generate(titleConvoId, messages);

    // Clean up the title
    let cleanTitle = generatedTitle
      .trim()
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
    // Reset flag so we can retry
    hasGeneratedTitleRef.current = false;
    // Don't throw - title generation is non-critical
  }
}

/**
 * Action: Send a new message and generate response
 */
export async function sendMessageWithResponse(
  message: string,
  entryId: number | undefined,
  currentMessages: Block[],
  currentTitle: string,
  context: AIChatActionContext
): Promise<number> {
  const {
    createEntry,
    updateEntry,
    onSave,
    actualEntryIdRef,
    setChatMessages,
  } = context;

  const userMessage: Block = {
    type: "markdown",
    content: message.trim(),
    role: "user",
  };

  const updatedMessages = [...currentMessages, userMessage];

  // Update local state immediately
  setChatMessages(updatedMessages);

  const finalTitle = currentTitle.trim() || "AI Conversation";
  let finalEntryId = entryId;

  // Save the message
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
      createEntry.mutate(
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
    actualEntryIdRef.current = entry.id;
    console.log("[AIChat Action] Created new entry:", entry.id);

    // Trigger navigation
    onSave?.(entry.id);
  }

  // Generate AI response
  const aiResponseContent = await generateAIResponse(updatedMessages, context);

  // Generate title if this is the first message
  if (currentMessages.length === 0) {
    await generateTitle(message, finalEntryId!, context, aiResponseContent);
  }

  return finalEntryId!;
}
