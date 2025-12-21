import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { springPresets } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import {
  HomeScreen,
  SettingsScreen,
  ComponentPlaygroundScreen,
  ComposerScreen,
  QuillEditorScreen,
} from "../screens";
import { useCreateEntry } from "../db/useEntries";

type Screen =
  | "home"
  | "settings"
  | "playground"
  | "quillEditor"
  | "composer"
  | "fullEditor"
  | "entryEditor";

export function SimpleNavigation() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [composerEntryType, setComposerEntryType] = useState<
    "journal" | "ai_chat" | undefined
  >(undefined);
  const [fullEditorEntryId, setFullEditorEntryId] = useState<
    number | undefined
  >(undefined);
  const [editingEntryId, setEditingEntryId] = useState<number | undefined>(
    undefined
  );
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const theme = useTheme();
  const createEntry = useCreateEntry();
  const swipeX = useRef(new Animated.Value(0)).current;
  const screenWidth = useRef(0);

  // Store onCancel handlers so we can call them when swiping back
  // ComposerScreen will handle force save internally
  const fullEditorOnCancelRef = useRef<(() => void | Promise<void>) | null>(
    null
  );
  const entryEditorOnCancelRef = useRef<(() => void | Promise<void>) | null>(
    null
  );

  const canGoBack = currentScreen !== "home";

  const handleGoBack = useCallback(async () => {
    if (currentScreen === "settings") {
      setCurrentScreen("home");
    } else if (currentScreen === "playground") {
      setCurrentScreen("settings");
    } else if (currentScreen === "quillEditor") {
      setCurrentScreen("settings");
    } else if (currentScreen === "composer") {
      setCurrentScreen("home");
      setComposerEntryType(undefined);
    } else if (currentScreen === "fullEditor") {
      // Call onCancel (ComposerScreen will handle force save internally)
      if (fullEditorOnCancelRef.current) {
        await fullEditorOnCancelRef.current();
      }
    } else if (currentScreen === "entryEditor") {
      // Call onCancel (ComposerScreen will handle force save internally)
      if (entryEditorOnCancelRef.current) {
        await entryEditorOnCancelRef.current();
      }
    }
  }, [currentScreen]);

  // Only handle swipe gestures from the left edge
  // This won't interfere with vertical scrolling
  const panResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(
    null
  );

  useEffect(() => {
    panResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (!canGoBack) return false;

        // Only respond if gesture starts from the very left edge (< 20px)
        const startX = evt.nativeEvent.pageX;
        if (startX > 20) return false;

        // Only respond to clearly horizontal gestures
        // Require horizontal movement to be at least 2x vertical movement
        const isHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        if (!isHorizontal) return false;

        // Only respond to rightward swipes
        if (gestureState.dx < 10) return false;

        return true;
      },
      onPanResponderTerminationRequest: (evt, gestureState) => {
        // Allow termination if gesture becomes vertical (for ScrollView)
        const isVertical =
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVertical;
      },
      onPanResponderGrant: () => {
        swipeX.stopAnimation((value) => {
          swipeX.setOffset(value);
          swipeX.setValue(0);
        });
      },
      onPanResponderMove: (evt, gestureState) => {
        // Only allow rightward swipe
        if (gestureState.dx > 0) {
          swipeX.setValue(Math.min(gestureState.dx, screenWidth.current));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        swipeX.flattenOffset();
        const swipeThreshold = screenWidth.current * 0.25; // 25% threshold

        if (gestureState.dx > swipeThreshold || gestureState.vx > 0.3) {
          // Complete the swipe - navigate back
          Animated.spring(swipeX, {
            toValue: screenWidth.current,
            ...springPresets.modal,
            useNativeDriver: false,
          }).start(() => {
            handleGoBack();
            swipeX.setValue(0);
          });
        } else {
          // Cancel the swipe - return to original position
          Animated.spring(swipeX, {
            toValue: 0,
            ...springPresets.modal,
            useNativeDriver: false,
          }).start();
        }
      },
    });
  }, [canGoBack, handleGoBack, swipeX]);

  // Handle hardware back button (Android) and system back gestures
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canGoBack) {
          handleGoBack();
          return true; // Prevent default behavior (exiting app)
        }
        return false; // Allow default behavior (exit app) when on home screen
      }
    );

    return () => backHandler.remove();
  }, [canGoBack, handleGoBack]);

  const handleOpenSettings = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const handleNavigateToPlayground = useCallback(() => {
    setCurrentScreen("playground");
  }, []);

  const handleNavigateToQuillEditor = useCallback(() => {
    setCurrentScreen("quillEditor");
  }, []);

  const handleOpenComposer = useCallback((type?: "journal" | "ai_chat") => {
    setComposerEntryType(type);
    setCurrentScreen("composer");
  }, []);

  const handleComposerSave = useCallback((entryId: number) => {
    // Navigate back to home after saving
    // React Query cache handles the update automatically
    setCurrentScreen("home");
    setComposerEntryType(undefined);
  }, []);

  const handleComposerCancel = useCallback(() => {
    setCurrentScreen("home");
    setComposerEntryType(undefined);
  }, []);

  // Use ref to avoid re-creating callback when createEntry changes
  const createEntryRef = useRef(createEntry);
  createEntryRef.current = createEntry;

  const handleOpenFullEditor = useCallback(async (initialText?: string) => {
    // Create entry immediately with the initial text in an H1
    const content = (initialText || "").trim();

    // Create HTML block with H1 for the first letter/text
    const htmlContent =
      content.length > 0
        ? `<h1>${content}</h1>`
        : "<p></p>"; // Empty paragraph to start

    const blocks = [
      {
        type: "html" as const,
        content: htmlContent,
      },
    ];

    try {
      const entry = await createEntryRef.current.mutateAsync({
        type: "journal",
        title: content.slice(0, 50) || "Untitled",
        blocks,
        tags: [],
        attachments: [],
        isFavorite: false,
      });

      setFullEditorEntryId(entry.id);
      setCurrentScreen("fullEditor");
    } catch (error) {
      // Still navigate even if creation fails - ComposerScreen can handle it
      setCurrentScreen("fullEditor");
    }
  }, []);

  const handleFullEditorSave = useCallback((entryId: number) => {
    // Don't navigate away - let user continue writing (auto-save handles saving)
    // React Query cache handles the update automatically
  }, []);

  const handleFullEditorCancel = useCallback(async () => {
    // React Query cache handles any updates automatically
    setCurrentScreen("home");
    setFullEditorEntryId(undefined);
  }, []);

  const handleOpenEntryEditor = useCallback((entryId: number) => {
    setEditingEntryId(entryId);
    setCurrentScreen("entryEditor");
  }, []);

  // Open a new AI chat without creating an entry first
  // Entry will be created when user sends their first message
  const handleCreateNewAIChat = useCallback(() => {
    setEditingEntryId(undefined);
    setComposerEntryType("ai_chat");
    setCurrentScreen("entryEditor");
  }, []);

  const handleEntryEditorSave = useCallback((entryId: number) => {
    // Don't navigate away on save for journal entries (they auto-save)
    // Only navigate for AI chat or if explicitly closing
    // React Query cache handles the update automatically
    // Update editingEntryId when a new entry is created (e.g., from new AI chat)
    if (!editingEntryId && entryId) {
      setEditingEntryId(entryId);
    }
  }, [editingEntryId]);

  const handleEntryEditorCancel = useCallback(async () => {
    // React Query cache handles any updates automatically
    setCurrentScreen("home");
    setEditingEntryId(undefined);
    setComposerEntryType(undefined);
  }, []);

  const handleSettingsBack = useCallback(() => {
    setCurrentScreen("home");
  }, []);

  const handlePlaygroundBack = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const handleQuillEditorBack = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return (
          <HomeScreen
            refreshKey={homeRefreshKey}
            onOpenFullEditor={handleOpenFullEditor}
            onOpenSettings={handleOpenSettings}
            onOpenEntryEditor={handleOpenEntryEditor}
          />
        );
      case "settings":
        return (
          <SettingsScreen
            onNavigateToPlayground={handleNavigateToPlayground}
            onNavigateToQuillEditor={handleNavigateToQuillEditor}
            onBack={handleSettingsBack}
          />
        );
      case "playground":
        return <ComponentPlaygroundScreen onBack={handlePlaygroundBack} />;
      case "quillEditor":
        return <QuillEditorScreen onBack={handleQuillEditorBack} />;
      case "composer":
        return (
          <ComposerScreen
            initialType={composerEntryType}
            onSave={handleComposerSave}
            onCancel={handleComposerCancel}
          />
        );
      case "fullEditor":
        fullEditorOnCancelRef.current = handleFullEditorCancel;
        return (
          <ComposerScreen
            entryId={fullEditorEntryId}
            onSave={handleFullEditorSave}
            onCancel={handleFullEditorCancel}
            fullScreen={true}
          />
        );
      case "entryEditor":
        entryEditorOnCancelRef.current = handleEntryEditorCancel;
        return (
          <ComposerScreen
            entryId={editingEntryId}
            initialType={composerEntryType}
            onSave={handleEntryEditorSave}
            onCancel={handleEntryEditorCancel}
          />
        );
      default:
        return (
          <HomeScreen
            refreshKey={homeRefreshKey}
            onOpenFullEditor={handleOpenFullEditor}
            onOpenSettings={handleOpenSettings}
            onOpenEntryEditor={handleOpenEntryEditor}
            onCreateNewAIChat={handleCreateNewAIChat}
          />
        );
    }
  };

  const seasonalTheme = useSeasonalTheme();

  // Render overlay screen (everything except home)
  const renderOverlayScreen = () => {
    switch (currentScreen) {
      case "settings":
        return (
          <SettingsScreen
            onNavigateToPlayground={handleNavigateToPlayground}
            onNavigateToQuillEditor={handleNavigateToQuillEditor}
            onBack={handleSettingsBack}
          />
        );
      case "playground":
        return <ComponentPlaygroundScreen onBack={handlePlaygroundBack} />;
      case "quillEditor":
        return <QuillEditorScreen onBack={handleQuillEditorBack} />;
      case "composer":
        return (
          <ComposerScreen
            initialType={composerEntryType}
            onSave={handleComposerSave}
            onCancel={handleComposerCancel}
          />
        );
      case "fullEditor":
        fullEditorOnCancelRef.current = handleFullEditorCancel;
        return (
          <ComposerScreen
            entryId={fullEditorEntryId}
            onSave={handleFullEditorSave}
            onCancel={handleFullEditorCancel}
            fullScreen={true}
          />
        );
      case "entryEditor":
        entryEditorOnCancelRef.current = handleEntryEditorCancel;
        return (
          <ComposerScreen
            entryId={editingEntryId}
            initialType={composerEntryType}
            onSave={handleEntryEditorSave}
            onCancel={handleEntryEditorCancel}
          />
        );
      default:
        return null;
    }
  };

  const isHomeScreen = currentScreen === "home";

  return (
    <SafeAreaView
      style={[
        styles.safeAreaContainer,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
      edges={["top"]}
      onLayout={(event) => {
        screenWidth.current = event.nativeEvent.layout.width;
      }}
    >
      <View style={styles.container}>
        {/* HomeScreen is always mounted but hidden when not active */}
        <View
          style={[styles.content, !isHomeScreen && styles.hidden]}
          pointerEvents={isHomeScreen ? "auto" : "none"}
        >
          <HomeScreen
            refreshKey={homeRefreshKey}
            isVisible={isHomeScreen}
            onOpenFullEditor={handleOpenFullEditor}
            onOpenSettings={handleOpenSettings}
            onOpenEntryEditor={handleOpenEntryEditor}
            onCreateNewAIChat={handleCreateNewAIChat}
          />
        </View>

        {/* Overlay screens render on top when not on home */}
        {!isHomeScreen && (
          <Animated.View
            style={[
              styles.overlayContent,
              {
                transform: [{ translateX: swipeX }],
              },
            ]}
            {...(panResponderRef.current?.panHandlers || {})}
          >
            {renderOverlayScreen()}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  hidden: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  overlayContent: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
});
