import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  BackHandler,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCreateEntry } from "../db/useEntries";
import {
  HomeScreen,
  SettingsScreen,
  ComponentPlaygroundScreen,
  ComposerScreen,
  QuillEditorScreen,
} from "../screens";
import { CountdownComposer } from "../screens/CountdownComposer";
import { CountdownViewer } from "../screens/CountdownViewer";
import { springPresets } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

type Screen =
  | "home"
  | "settings"
  | "playground"
  | "quillEditor"
  | "composer"
  | "fullEditor"
  | "entryEditor"
  | "countdownComposer"
  | "countdownViewer";

// Navigation ref for external navigation (e.g., from notification handler)
export interface NavigationRef {
  navigateToCountdownViewer: (
    entryId: number,
    showCheckinPrompt?: boolean,
  ) => void;
}

// Global navigation ref
let navigationRefInstance: NavigationRef | null = null;

export function setNavigationRef(ref: NavigationRef | null): void {
  navigationRefInstance = ref;
}

export function getNavigationRef(): NavigationRef | null {
  return navigationRefInstance;
}

export function SimpleNavigation() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [composerEntryType, setComposerEntryType] = useState<
    "journal" | "ai_chat" | undefined
  >(undefined);
  const [fullEditorEntryId, setFullEditorEntryId] = useState<
    number | undefined
  >(undefined);
  const [editingEntryId, setEditingEntryId] = useState<number | undefined>(
    undefined,
  );
  const [countdownEntryId, setCountdownEntryId] = useState<number | undefined>(
    undefined,
  );
  const [countdownViewerEntryId, setCountdownViewerEntryId] = useState<
    number | undefined
  >(undefined);
  const [checkinParentId, setCheckinParentId] = useState<number | undefined>(
    undefined,
  );
  const [_homeRefreshKey, _setHomeRefreshKey] = useState(0);
  const createEntry = useCreateEntry();
  const swipeX = useRef(new Animated.Value(0)).current;
  const screenWidth = useRef(0);

  // Store onCancel handlers so we can call them when swiping back
  // ComposerScreen will handle force save internally
  const fullEditorOnCancelRef = useRef<(() => void | Promise<void>) | null>(
    null,
  );
  const entryEditorOnCancelRef = useRef<(() => void | Promise<void>) | null>(
    null,
  );
  const countdownOnCancelRef = useRef<(() => void | Promise<void>) | null>(
    null,
  );
  const countdownViewerOnCloseRef = useRef<(() => void | Promise<void>) | null>(
    null,
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
    } else if (currentScreen === "countdownComposer") {
      if (countdownOnCancelRef.current) {
        await countdownOnCancelRef.current();
      }
    } else if (currentScreen === "countdownViewer") {
      if (countdownViewerOnCloseRef.current) {
        await countdownViewerOnCloseRef.current();
      }
    }
  }, [currentScreen]);

  // Only handle swipe gestures from the left edge
  // This won't interfere with vertical scrolling
  const panResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(
    null,
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
      },
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

  const _handleOpenComposer = useCallback((type?: "journal" | "ai_chat") => {
    setComposerEntryType(type);
    setCurrentScreen("composer");
  }, []);

  const handleComposerSave = useCallback((_entryId: number) => {
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
    const htmlContent = content.length > 0 ? `<h1>${content}</h1>` : "<p></p>"; // Empty paragraph to start

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
    } catch (_error) {
      // Still navigate even if creation fails - ComposerScreen can handle it
      setCurrentScreen("fullEditor");
    }
  }, []);

  const handleFullEditorSave = useCallback((_entryId: number) => {
    // Don't navigate away - let user continue writing (auto-save handles saving)
    // React Query cache handles the update automatically
  }, []);

  const handleFullEditorCancel = useCallback(async () => {
    // React Query cache handles any updates automatically
    setCurrentScreen("home");
    setFullEditorEntryId(undefined);
  }, []);

  const handleOpenEntryEditor = useCallback(
    (entryId: number, entryType?: "journal" | "ai_chat" | "countdown") => {
      if (entryType === "countdown") {
        // Open countdown in viewer mode (not edit mode)
        setCountdownViewerEntryId(entryId);
        setCurrentScreen("countdownViewer");
      } else {
        setEditingEntryId(entryId);
        setCurrentScreen("entryEditor");
      }
    },
    [],
  );

  // Open a new AI chat without creating an entry first
  // Entry will be created when user sends their first message
  const handleCreateNewAIChat = useCallback(() => {
    setEditingEntryId(undefined);
    setComposerEntryType("ai_chat");
    setCurrentScreen("entryEditor");
  }, []);

  const handleEntryEditorSave = useCallback(
    (entryId: number) => {
      // Don't navigate away on save for journal entries (they auto-save)
      // Only navigate for AI chat or if explicitly closing
      // React Query cache handles the update automatically
      // Update editingEntryId when a new entry is created (e.g., from new AI chat)
      if (!editingEntryId && entryId) {
        setEditingEntryId(entryId);
      }
    },
    [editingEntryId],
  );

  const handleEntryEditorCancel = useCallback(async () => {
    // React Query cache handles any updates automatically
    // If we were creating/editing a check-in, go back to the viewer
    if (checkinParentId) {
      setCountdownViewerEntryId(checkinParentId);
      setCurrentScreen("countdownViewer");
    } else {
      setCurrentScreen("home");
    }
    setEditingEntryId(undefined);
    setComposerEntryType(undefined);
    setCheckinParentId(undefined);
  }, [checkinParentId]);

  // Countdown composer handlers
  const handleCreateCountdown = useCallback(() => {
    setCountdownEntryId(undefined);
    setCurrentScreen("countdownComposer");
  }, []);

  const handleCountdownSave = useCallback(
    (_entryId: number) => {
      // If we were editing from the viewer, go back to viewer
      if (countdownViewerEntryId) {
        setCurrentScreen("countdownViewer");
      } else {
        setCurrentScreen("home");
      }
      setCountdownEntryId(undefined);
    },
    [countdownViewerEntryId],
  );

  const handleCountdownCancel = useCallback(() => {
    // If we were editing from the viewer, go back to viewer
    if (countdownViewerEntryId) {
      setCurrentScreen("countdownViewer");
    } else {
      setCurrentScreen("home");
    }
    setCountdownEntryId(undefined);
  }, [countdownViewerEntryId]);

  // Countdown viewer handlers (for notification deep linking)
  const handleNavigateToCountdownViewer = useCallback((entryId: number) => {
    setCountdownViewerEntryId(entryId);
    setCurrentScreen("countdownViewer");
  }, []);

  const handleCountdownViewerClose = useCallback(() => {
    setCurrentScreen("home");
    setCountdownViewerEntryId(undefined);
  }, []);

  // Handler for editing a countdown from the viewer
  const handleCountdownViewerEdit = useCallback((entryId: number) => {
    setCountdownEntryId(entryId);
    setCurrentScreen("countdownComposer");
  }, []);

  // Handler for adding a check-in to a countdown
  const handleAddCheckin = useCallback((parentId: number) => {
    setCheckinParentId(parentId);
    setEditingEntryId(undefined);
    setComposerEntryType("journal");
    setCurrentScreen("entryEditor");
  }, []);

  // Handler for opening a check-in from the countdown viewer
  const handleOpenCheckin = useCallback((entryId: number) => {
    setEditingEntryId(entryId);
    setComposerEntryType("journal");
    setCurrentScreen("entryEditor");
  }, []);

  // Register navigation ref for external navigation (e.g., notification handler)
  useEffect(() => {
    setNavigationRef({
      navigateToCountdownViewer: handleNavigateToCountdownViewer,
    });
    return () => setNavigationRef(null);
  }, [handleNavigateToCountdownViewer]);

  // Handle deep links from widgets
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;

      // Parse jot://countdown/{entryId} - view existing countdown
      const countdownMatch = url.match(/^jot:\/\/countdown\/(\d+)$/);
      if (countdownMatch) {
        const entryId = parseInt(countdownMatch[1], 10);
        if (!isNaN(entryId)) {
          handleNavigateToCountdownViewer(entryId);
        }
        return;
      }

      // Parse jot://create/{type} - quick create from widget
      const createMatch = url.match(
        /^jot:\/\/create\/(journal|chat|countdown)$/,
      );
      if (createMatch) {
        const type = createMatch[1];
        switch (type) {
          case "journal":
            handleOpenFullEditor();
            break;
          case "chat":
            handleCreateNewAIChat();
            break;
          case "countdown":
            handleCreateCountdown();
            break;
        }
        return;
      }
    };

    // Handle URL that opened the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Handle URL while app is running (warm start)
    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => subscription.remove();
  }, [
    handleNavigateToCountdownViewer,
    handleOpenFullEditor,
    handleCreateNewAIChat,
    handleCreateCountdown,
  ]);

  const handleSettingsBack = useCallback(() => {
    setCurrentScreen("home");
  }, []);

  const handlePlaygroundBack = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const handleQuillEditorBack = useCallback(() => {
    setCurrentScreen("settings");
  }, []);

  const _renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return (
          <HomeScreen
            refreshKey={_homeRefreshKey}
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
            refreshKey={_homeRefreshKey}
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
            parentId={checkinParentId}
            onSave={handleEntryEditorSave}
            onCancel={handleEntryEditorCancel}
          />
        );
      case "countdownComposer":
        countdownOnCancelRef.current = handleCountdownCancel;
        return (
          <CountdownComposer
            entryId={countdownEntryId}
            onSave={handleCountdownSave}
            onCancel={handleCountdownCancel}
          />
        );
      case "countdownViewer":
        countdownViewerOnCloseRef.current = handleCountdownViewerClose;
        return countdownViewerEntryId ? (
          <CountdownViewer
            entryId={countdownViewerEntryId}
            onClose={handleCountdownViewerClose}
            onEdit={handleCountdownViewerEdit}
            onAddCheckin={handleAddCheckin}
            onOpenCheckin={handleOpenCheckin}
          />
        ) : null;
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
            refreshKey={_homeRefreshKey}
            isVisible={isHomeScreen}
            onOpenFullEditor={handleOpenFullEditor}
            onOpenSettings={handleOpenSettings}
            onOpenEntryEditor={handleOpenEntryEditor}
            onEditCountdown={handleCountdownViewerEdit}
            onCreateNewAIChat={handleCreateNewAIChat}
            onCreateCountdown={handleCreateCountdown}
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
