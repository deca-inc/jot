import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { typography } from "../theme/typography";
import { useEntryRepository, Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { ensureModelPresent } from "../ai/modelManager";
import { Llama32_1B_Instruct } from "../ai/modelConfig";
import { useLLM, Message as LlmMessage } from "react-native-executorch";

export interface AIChatComposerProps {
  entryId?: number;
  initialTitle?: string;
  initialBlocks?: Block[];
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  onDelete?: (entryId: number) => void;
}

// Internal component that requires model paths to be ready
function AIChatComposerInternal({
  entryId,
  initialTitle = "",
  initialBlocks = [],
  onSave,
  onCancel,
  onDelete,
  modelPaths,
}: AIChatComposerProps & {
  modelPaths: {
    ptePath: string;
    tokenizerPath?: string;
    tokenizerConfigPath?: string;
  };
}) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const entryRepository = useEntryRepository();
  const [title, setTitle] = useState(initialTitle);
  const [chatMessages, setChatMessages] = useState<Block[]>(initialBlocks);
  const [newMessage, setNewMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!entryId);
  const [showMenu, setShowMenu] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const hasTriggeredInitialResponse = useRef(false);
  const isGeneratingRef = useRef(false);
  const generatingMessageIndexRef = useRef<number | null>(null);
  const capturedResponseRef = useRef<string | null>(null);

  // Initialize LLM with model paths
  const llm = useLLM({
    model: {
      modelSource: modelPaths.ptePath,
      tokenizerSource: modelPaths.tokenizerPath || "",
      tokenizerConfigSource: modelPaths.tokenizerConfigPath || "",
    },
  });

  // Watch for LLM errors
  useEffect(() => {
    if (llm.error) {
      console.error("LLM error:", llm.error);
      Alert.alert("Model Error", `LLM error: ${llm.error}`);
    }
  }, [llm.error]);

  // Helper function to update assistant message with response
  const updateAssistantMessage = useCallback((response: string) => {
    setChatMessages((prev) => {
      let lastAssistantIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          lastAssistantIndex = i;
          break;
        }
      }

      if (lastAssistantIndex >= 0) {
        const updated = [...prev];
        const lastMessage = updated[lastAssistantIndex];
        if (lastMessage.type === "markdown") {
          updated[lastAssistantIndex] = {
            ...lastMessage,
            content: response.trim(),
          };
        }
        return updated;
      } else {
        return [
          ...prev,
          {
            type: "markdown" as const,
            content: response.trim(),
            role: "assistant" as const,
          },
        ];
      }
    });
  }, []);

  // Watch for response updates during generation and capture them
  useEffect(() => {
    if (
      generatingMessageIndexRef.current !== null &&
      llm.response &&
      llm.response.length > 0
    ) {
      capturedResponseRef.current = llm.response;
      updateAssistantMessage(llm.response);
    }
  }, [llm.response, updateAssistantMessage]);

  // Load existing entry if entryId is provided
  useEffect(() => {
    if (!entryId) {
      setIsLoading(false);
      setChatMessages([]);
      return;
    }

    const loadEntry = async () => {
      try {
        const entry = await entryRepository.getById(entryId);
        if (entry) {
          setTitle(entry.title);
          if (entry.type === "ai_chat") {
            setChatMessages(entry.blocks);
            setNewMessage("");
          }
        }
      } catch (error) {
        console.error("Error loading entry:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  // Configure LLM once model is ready
  useEffect(() => {
    if (llm.configure && llm.isReady) {
      try {
        llm.configure({
          chatConfig: {
            initialMessageHistory: [],
            systemPrompt: "You are a helpful AI assistant.",
          },
          generationConfig: {},
        });
      } catch (configError) {
        console.error("Error configuring LLM:", configError);
      }
    }
  }, [llm.isReady, llm.configure]);

  // Reset trigger flag when entry changes
  useEffect(() => {
    hasTriggeredInitialResponse.current = false;
    isGeneratingRef.current = false;
  }, [entryId]);

  // Helper function to generate AI response
  const generateAIResponse = useCallback(
    async (messagesOverride?: Block[]) => {
      try {
        // Get messages to use (override or from state)
        let currentMessagesForLLM: Block[] = [];
        const placeholderAssistantMessage: Block = {
          type: "markdown",
          content: "",
          role: "assistant",
        };

        if (messagesOverride !== undefined) {
          currentMessagesForLLM = [...messagesOverride];
          generatingMessageIndexRef.current = currentMessagesForLLM.length;
          setChatMessages((prev) => [...prev, placeholderAssistantMessage]);
        } else {
          setChatMessages((prev) => {
            currentMessagesForLLM = [...prev];
            generatingMessageIndexRef.current = prev.length;
            return [...prev, placeholderAssistantMessage];
          });
        }

        // Convert to LLM message format
        const chat: LlmMessage[] = [
          { role: "system", content: "You are a helpful AI assistant." },
          ...currentMessagesForLLM
            .filter((m) => m.type === "markdown")
            .map((m) => ({
              role: (m.role as any) || "user",
              content: m.content,
            })),
        ];

        if (llm.error) {
          throw new Error(`LLM error: ${llm.error}`);
        }

        // Generate response - useEffect will capture it as it streams in
        await llm.generate(chat);

        // Wait for generation to complete
        let attempts = 0;
        while (llm.isGenerating && attempts < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          attempts++;
          if (llm.error) {
            throw new Error(`LLM error: ${llm.error}`);
          }
        }

        // Brief wait for final state updates
        await new Promise((resolve) => setTimeout(resolve, 200));

        if (llm.error) {
          throw new Error(`LLM error: ${llm.error}`);
        }

        // Get response - use captured response (from useEffect) or llm.response
        const finalResponse =
          capturedResponseRef.current?.trim() || llm.response?.trim() || "";

        if (finalResponse) {
          // Response was captured via useEffect and UI is already updated, just save to DB
          const finalTitle = title.trim() || "AI Conversation";
          setChatMessages((prev) => {
            const toSave = prev;
            if (entryId) {
              entryRepository
                .update(entryId, {
                  title: finalTitle,
                  blocks: toSave,
                })
                .then(() => onSave?.(entryId))
                .catch(console.error);
            } else {
              entryRepository
                .create({
                  type: "ai_chat",
                  title: finalTitle,
                  blocks: toSave,
                  tags: [],
                  attachments: [],
                  isFavorite: false,
                })
                .then((entry) => onSave?.(entry.id))
                .catch(console.error);
            }
            return toSave;
          });

          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        } else {
          // Remove placeholder message on empty response
          setChatMessages((prev) => prev.slice(0, -1));
          Alert.alert(
            "AI Response",
            "The model generated an empty response. Please try again."
          );
        }
      } catch (e) {
        console.error("Error generating AI response:", e);
        setChatMessages((prev) => prev.slice(0, -1));
        Alert.alert(
          "AI Error",
          `Failed to generate a response: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      } finally {
        generatingMessageIndexRef.current = null;
        capturedResponseRef.current = null;
      }
    },
    [llm, title, entryId, entryRepository, onSave]
  );

  // Trigger AI response for initial prompt if needed
  useEffect(() => {
    if (
      !isLoading &&
      llm.isReady &&
      !hasTriggeredInitialResponse.current &&
      !isGeneratingRef.current &&
      chatMessages.length === 1 &&
      chatMessages[0]?.role === "user"
    ) {
      hasTriggeredInitialResponse.current = true;
      isGeneratingRef.current = true;

      generateAIResponse(chatMessages).finally(() => {
        isGeneratingRef.current = false;
      });
    }
  }, [isLoading, llm.isReady, chatMessages, generateAIResponse]);

  const handleTitleFocus = useCallback(() => {
    setTimeout(() => {
      titleInputRef.current?.setNativeProps({
        selection: { start: 0, end: title.length },
      });
    }, 100);
  }, [title]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  const handleTitleBlur = useCallback(async () => {
    if (!entryId) return;

    const newTitle = title.trim();
    setIsSaving(true);
    try {
      await entryRepository.update(entryId, {
        title: newTitle || undefined,
      });
      onSave?.(entryId);
    } catch (error) {
      console.error("Error updating title:", error);
    } finally {
      setIsSaving(false);
    }
  }, [title, entryId, entryRepository, onSave]);

  const handleTitleSubmit = useCallback(async () => {
    titleInputRef.current?.blur();
    await handleTitleBlur();
  }, [handleTitleBlur]);

  const handleDelete = useCallback(() => {
    if (!entryId) return;

    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this entry? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await entryRepository.delete(entryId);
              onDelete?.(entryId);
              onCancel?.();
            } catch (error) {
              console.error("Error deleting entry:", error);
              Alert.alert("Error", "Failed to delete entry");
            }
          },
        },
      ]
    );
  }, [entryId, entryRepository, onDelete, onCancel]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    if (!llm.isReady) {
      Alert.alert(
        "Model Not Ready",
        "The AI model is still loading. Please wait a moment and try again."
      );
      return;
    }

    const userMessage: Block = {
      type: "markdown",
      content: newMessage.trim(),
      role: "user",
    };

    // Add user message to chat
    let updatedMessages: Block[] = [];
    setChatMessages((prev) => {
      updatedMessages = [...prev, userMessage];

      // Save the user message immediately
      const finalTitle = title.trim() || "AI Conversation";
      setIsSaving(true);
      (async () => {
        try {
          if (entryId) {
            await entryRepository.update(entryId, {
              title: finalTitle,
              blocks: updatedMessages,
            });
            onSave?.(entryId);
          } else {
            const entry = await entryRepository.create({
              type: "ai_chat",
              title: finalTitle,
              blocks: updatedMessages,
              tags: [],
              attachments: [],
              isFavorite: false,
            });
            onSave?.(entry.id);
          }
        } catch (error) {
          console.error("Error saving message:", error);
        } finally {
          setIsSaving(false);
        }
      })();

      return updatedMessages;
    });

    setNewMessage("");

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Generate AI response
    setTimeout(() => {
      generateAIResponse(updatedMessages);
    }, 0);
  }, [
    newMessage,
    title,
    entryId,
    entryRepository,
    onSave,
    llm.isReady,
    generateAIResponse,
  ]);

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      {/* Standardized Header */}
      <View style={styles.standardHeader}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.backButton}
          disabled={isSaving}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={styles.headerTitleInputWrapper}>
            <TextInput
              ref={titleInputRef}
              style={[
                styles.headerTitleInput,
                { color: seasonalTheme.textPrimary },
              ]}
              value={title}
              onChangeText={handleTitleChange}
              onFocus={handleTitleFocus}
              onBlur={handleTitleBlur}
              onSubmitEditing={handleTitleSubmit}
              placeholder="AI Conversation"
              placeholderTextColor={seasonalTheme.textSecondary}
              editable={true}
              {...(Platform.OS === "android" && {
                includeFontPadding: false,
              })}
            />
          </View>
        </View>
        {entryId && (
          <TouchableOpacity
            onPress={() => setShowMenu(true)}
            style={styles.menuButton}
            disabled={isSaving}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={24}
              color={seasonalTheme.textPrimary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Menu Modal */}
      {showMenu && (
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setShowMenu(false)}
          >
            <View
              style={[
                styles.menuContainer,
                {
                  backgroundColor: seasonalTheme.cardBg,
                  shadowColor: seasonalTheme.subtleGlow.shadowColor,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  handleDelete();
                }}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#FF3B30"
                  style={styles.menuIcon}
                />
                <Text style={{ color: "#FF3B30" }}>Delete Conversation</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatMessages}
        contentContainerStyle={[
          styles.chatMessagesContent,
          { paddingBottom: insets.bottom + spacingPatterns.md },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {chatMessages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
              Start a conversation with your AI assistant...
            </Text>
          </View>
        ) : (
          chatMessages.map((message, index) => {
            const isUser = message.role === "user";
            const messageContent =
              message.type === "markdown" ? message.content : "";
            const isEmpty =
              !messageContent || messageContent.trim().length === 0;
            const isGenerating =
              !isUser &&
              isEmpty &&
              (llm.isGenerating || generatingMessageIndexRef.current === index);

            return (
              <View
                key={`${index}-${messageContent.length}`}
                style={[
                  styles.messageBubble,
                  isUser ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <View
                  style={[
                    styles.messageContent,
                    {
                      backgroundColor: isUser
                        ? seasonalTheme.chipBg || "rgba(0, 0, 0, 0.1)"
                        : seasonalTheme.cardBg || "rgba(255, 255, 255, 0.1)",
                    },
                  ]}
                >
                  {isGenerating ? (
                    <Text
                      variant="body"
                      style={{
                        color: seasonalTheme.textSecondary,
                        fontStyle: "italic",
                      }}
                    >
                      Thinking...
                    </Text>
                  ) : (
                    <Text
                      variant="body"
                      style={{
                        color: isUser
                          ? seasonalTheme.chipText || seasonalTheme.textPrimary
                          : seasonalTheme.textPrimary,
                      }}
                    >
                      {messageContent || " "}
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View
        style={[
          styles.chatInputContainer,
          {
            backgroundColor: seasonalTheme.cardBg,
            paddingBottom: insets.bottom || spacingPatterns.sm,
          },
        ]}
      >
        <TextInput
          style={[
            styles.chatInput,
            {
              color: seasonalTheme.textPrimary,
              borderColor: seasonalTheme.textSecondary + "20",
            },
          ]}
          placeholder="Type your message..."
          placeholderTextColor={seasonalTheme.textSecondary}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || isSaving}
          style={[
            styles.sendButton,
            {
              backgroundColor:
                newMessage.trim() && !isSaving
                  ? seasonalTheme.chipBg
                  : seasonalTheme.textSecondary + "20",
            },
          ]}
        >
          <Ionicons
            name="send"
            size={20}
            color={
              newMessage.trim() && !isSaving
                ? seasonalTheme.chipText || seasonalTheme.textPrimary
                : seasonalTheme.textSecondary + "80"
            }
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// Export wrapper that ensures model before rendering
export function AIChatComposer(props: AIChatComposerProps) {
  const theme = useTheme();
  const [modelPaths, setModelPaths] = useState<{
    ptePath: string;
    tokenizerPath?: string;
    tokenizerConfigPath?: string;
  } | null>(null);
  const [isEnsuringModel, setIsEnsuringModel] = useState(true);

  // Ensure model files once on mount
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout | undefined;

    (async () => {
      try {
        const config = Llama32_1B_Instruct;
        const isPlaceholder =
          config.pteSource.kind === "remote" &&
          config.pteSource.url.includes("YOUR_HOST");

        if (isPlaceholder) {
          if (mounted) {
            Alert.alert(
              "Model Not Configured",
              "AI model URLs are not configured. Please set up model URLs in Settings or configure them in lib/ai/modelConfig.ts",
              [
                {
                  text: "OK",
                  onPress: () => {
                    if (mounted) {
                      setIsEnsuringModel(false);
                    }
                  },
                },
              ]
            );
          }
          return;
        }

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Model download timed out after 30 seconds"));
          }, 30000);
        });

        const ensured = (await Promise.race([
          ensureModelPresent(Llama32_1B_Instruct),
          timeoutPromise,
        ])) as any;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!mounted) return;
        setModelPaths(ensured);
      } catch (e: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error("Error ensuring model:", e);
        const errorMessage = e?.message || "Unknown error";
        if (mounted) {
          Alert.alert(
            "Model Error",
            `Failed to load AI model: ${errorMessage}\n\nPlease check your model URLs in Settings or ensure models are properly configured.`,
            [
              {
                text: "OK",
                onPress: () => {
                  if (mounted) {
                    setIsEnsuringModel(false);
                  }
                },
              },
            ]
          );
        }
      } finally {
        if (mounted) {
          setIsEnsuringModel(false);
        }
      }
    })();
    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Show loading state while ensuring model
  if (isEnsuringModel || !modelPaths) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text>Loading AI model...</Text>
        <Text style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
          {isEnsuringModel
            ? "Downloading model files..."
            : "Model not available"}
        </Text>
      </View>
    );
  }

  // Render internal component once model paths are ready
  return <AIChatComposerInternal {...props} modelPaths={modelPaths} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  standardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  headerTitleContainer: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitleInputWrapper: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
    ...(Platform.OS === "ios" && {
      paddingTop: 8,
    }),
  },
  headerTitleInput: {
    width: "100%",
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.fontSize,
    height: typography.h3.fontSize * typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    paddingHorizontal: 0,
    margin: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    ...(Platform.OS === "android" && {
      textAlignVertical: "center",
      includeFontPadding: false,
      paddingVertical: 0,
    }),
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    minWidth: 200,
    borderRadius: borderRadius.lg,
    padding: spacingPatterns.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
  },
  menuIcon: {
    marginRight: spacingPatterns.sm,
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.xl * 2,
  },
  messageBubble: {
    marginBottom: spacingPatterns.md,
  },
  userMessage: {
    alignItems: "flex-end",
  },
  assistantMessage: {
    alignItems: "flex-start",
  },
  messageContent: {
    maxWidth: "80%",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    paddingTop: spacingPatterns.sm,
    gap: spacingPatterns.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  chatInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
    borderWidth: 1,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
