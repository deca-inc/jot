import { Ionicons } from "@expo/vector-icons";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  BackHandler,
  Linking,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, SearchModal, MenuItem, PopoverMenu } from "../components";
import { useCreateEntry, useEntry, useDeleteEntry } from "../db/useEntries";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import {
  HomeScreen,
  SettingsScreen,
  ComponentPlaygroundScreen,
  ComposerScreen,
  QuillEditorScreen,
} from "../screens";
import { CountdownComposer } from "../screens/CountdownComposer";
import { CountdownViewer } from "../screens/CountdownViewer";
import { useSyncAuthContext } from "../sync/SyncAuthProvider";
import { borderRadius, spacingPatterns } from "../theme";
import { springPresets } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";

const appIcon = require("../../assets/icon.png") as number;

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

  // Handle hardware back button (Android only)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (canGoBack) {
          handleGoBack();
          return true;
        }
        return false;
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
        setComposerEntryType(entryType); // Pass entry type to avoid flash
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
  const theme = useTheme();
  const isWideScreen = useIsWideScreen();
  const syncAuth = useSyncAuthContext();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showContentMenu, setShowContentMenu] = useState(false);
  const [modelInfo, setModelInfo] = useState<{
    displayName: string;
    openSelector: () => void;
  } | null>(null);
  const deleteEntryMutation = useDeleteEntry();

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    if (!isWideScreen) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearchModal((v) => !v);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isWideScreen]);

  const handleSearchSelect = useCallback(
    (entryId: number, entryType: "journal" | "ai_chat" | "countdown") => {
      handleOpenEntryEditor(entryId, entryType);
    },
    [handleOpenEntryEditor],
  );

  // Determine currently active entry ID for sidebar highlight
  const activeEntryId =
    currentScreen === "entryEditor"
      ? editingEntryId
      : currentScreen === "fullEditor"
        ? fullEditorEntryId
        : currentScreen === "countdownViewer"
          ? countdownViewerEntryId
          : currentScreen === "countdownComposer"
            ? countdownEntryId
            : undefined;

  // Fetch active entry for content header title
  const activeEntryQuery = useEntry(activeEntryId);
  const activeEntryTitle = activeEntryQuery.data?.title || "";
  const activeEntryParentId = activeEntryQuery.data?.parentId ?? undefined;

  // Fetch parent entry for breadcrumb
  const parentEntryQuery = useEntry(activeEntryParentId);
  const parentEntryTitle = parentEntryQuery.data?.title || "";

  // Auto-select first entry on wide screens when nothing is selected
  const handleFirstEntryAvailable = useCallback(
    (entryId: number, entryType: string) => {
      if (isWideScreen && currentScreen === "home") {
        handleOpenEntryEditor(
          entryId,
          entryType as "journal" | "ai_chat" | "countdown",
        );
      }
    },
    [isWideScreen, currentScreen, handleOpenEntryEditor],
  );

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

  // Check if current screen is an entry-level screen (shown in content panel on wide)
  const isEntryScreen =
    currentScreen === "entryEditor" ||
    currentScreen === "fullEditor" ||
    currentScreen === "countdownViewer" ||
    currentScreen === "countdownComposer" ||
    currentScreen === "composer";

  // On wide screens, render content panel inline (no overlay)
  const renderContentPanel = () => {
    if (currentScreen === "entryEditor") {
      entryEditorOnCancelRef.current = handleEntryEditorCancel;
      return (
        <ComposerScreen
          entryId={editingEntryId}
          initialType={composerEntryType}
          parentId={checkinParentId}
          onSave={handleEntryEditorSave}
          onCancel={handleEntryEditorCancel}
          hideBackButton
          onModelInfo={setModelInfo}
        />
      );
    }
    if (currentScreen === "fullEditor") {
      fullEditorOnCancelRef.current = handleFullEditorCancel;
      return (
        <ComposerScreen
          entryId={fullEditorEntryId}
          onSave={handleFullEditorSave}
          onCancel={handleFullEditorCancel}
          fullScreen
          hideBackButton
        />
      );
    }
    if (currentScreen === "composer") {
      return (
        <ComposerScreen
          initialType={composerEntryType}
          onSave={handleComposerSave}
          onCancel={handleComposerCancel}
          hideBackButton
        />
      );
    }
    if (currentScreen === "countdownComposer") {
      countdownOnCancelRef.current = handleCountdownCancel;
      return (
        <CountdownComposer
          entryId={countdownEntryId}
          onSave={handleCountdownSave}
          onCancel={handleCountdownCancel}
          compact
        />
      );
    }
    if (currentScreen === "countdownViewer" && countdownViewerEntryId) {
      countdownViewerOnCloseRef.current = handleCountdownViewerClose;
      return (
        <CountdownViewer
          entryId={countdownViewerEntryId}
          onClose={handleCountdownViewerClose}
          onEdit={handleCountdownViewerEdit}
          onAddCheckin={handleAddCheckin}
          onOpenCheckin={handleOpenCheckin}
          compact
        />
      );
    }
    return null;
  };

  // Wide screen: sidebar + content panel
  if (isWideScreen) {
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
        <View style={styles.sidebarLayout}>
          {/* Sidebar */}
          <View
            style={[
              styles.sidebar,
              {
                borderRightColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)",
              },
            ]}
          >
            {/* Sidebar header */}
            <View
              style={[
                styles.panelHeader,
                {
                  borderBottomColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <Image source={appIcon} style={styles.logoIcon} />
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                Jot
              </Text>
            </View>

            {/* New entry actions */}
            <View style={styles.sidebarActions}>
              <TouchableOpacity
                style={styles.sidebarActionButton}
                onPress={() => handleOpenFullEditor()}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={seasonalTheme.textPrimary}
                />
                <Text
                  variant="body"
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                  }}
                >
                  New Note
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sidebarActionButton}
                onPress={handleCreateNewAIChat}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={16}
                  color={seasonalTheme.textPrimary}
                />
                <Text
                  variant="body"
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                  }}
                >
                  New AI Chat
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sidebarActionButton}
                onPress={handleCreateCountdown}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="timer-outline"
                  size={16}
                  color={seasonalTheme.textPrimary}
                />
                <Text
                  variant="body"
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                  }}
                >
                  New Countdown
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sidebarActionButton}
                onPress={() => setShowSearchModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="search-outline"
                  size={16}
                  color={seasonalTheme.textPrimary}
                />
                <Text
                  variant="body"
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                    flex: 1,
                  }}
                >
                  Search
                </Text>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary + "80",
                    fontSize: 11,
                  }}
                >
                  {"\u2318K"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Entry list */}
            <View style={styles.sidebarList}>
              <HomeScreen
                refreshKey={_homeRefreshKey}
                isVisible={true}
                onOpenFullEditor={handleOpenFullEditor}
                onOpenSettings={handleOpenSettings}
                onOpenEntryEditor={handleOpenEntryEditor}
                onEditCountdown={handleCountdownViewerEdit}
                onCreateNewAIChat={handleCreateNewAIChat}
                onCreateCountdown={handleCreateCountdown}
                selectedEntryId={activeEntryId}
                onFirstEntryAvailable={handleFirstEntryAvailable}
                compact
              />
            </View>

            {/* Settings bar at bottom */}
            <TouchableOpacity
              style={[
                styles.sidebarFooter,
                {
                  borderTopColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
              onPress={handleOpenSettings}
              activeOpacity={0.7}
            >
              <Ionicons
                name="settings-outline"
                size={18}
                color={seasonalTheme.textSecondary}
              />
              <Text
                variant="body"
                numberOfLines={1}
                style={{
                  color: seasonalTheme.textSecondary,
                  fontSize: 13,
                  marginLeft: 8,
                  flex: 1,
                }}
              >
                {syncAuth.state.status === "authenticated" &&
                syncAuth.state.settings?.email
                  ? syncAuth.state.settings.email
                  : "Settings"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content panel */}
          <View style={styles.contentPanel}>
            {/* Content header */}
            <View
              style={[
                styles.panelHeader,
                {
                  borderBottomColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <View style={styles.headerTitleRow}>
                {isEntryScreen && activeEntryParentId && parentEntryTitle ? (
                  <>
                    <TouchableOpacity
                      onPress={() =>
                        handleOpenEntryEditor(
                          activeEntryParentId,
                          parentEntryQuery.data?.type as
                            | "journal"
                            | "ai_chat"
                            | "countdown",
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        variant="body"
                        numberOfLines={1}
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontSize: 14,
                        }}
                      >
                        {parentEntryTitle}
                      </Text>
                    </TouchableOpacity>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={seasonalTheme.textSecondary + "80"}
                      style={{ marginHorizontal: 4 }}
                    />
                    <Text
                      variant="body"
                      numberOfLines={1}
                      style={{
                        color: seasonalTheme.textPrimary,
                        fontWeight: "600",
                        fontSize: 14,
                        flexShrink: 1,
                      }}
                    >
                      {activeEntryTitle || ""}
                    </Text>
                  </>
                ) : (
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                  >
                    {currentScreen === "settings"
                      ? "Settings"
                      : currentScreen === "playground"
                        ? "Component Playground"
                        : currentScreen === "countdownComposer"
                          ? countdownEntryId
                            ? "Edit Timer"
                            : "New Timer"
                          : activeEntryTitle ||
                            (composerEntryType === "ai_chat" ? "New Chat" : "")}
                  </Text>
                )}
                {/* Model selector in header for AI chats */}
                {(activeEntryQuery.data?.type === "ai_chat" ||
                  composerEntryType === "ai_chat") &&
                  modelInfo && (
                    <TouchableOpacity
                      style={styles.headerModelSelector}
                      onPress={modelInfo.openSelector}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="hardware-chip-outline"
                        size={13}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="caption"
                        numberOfLines={1}
                        style={{
                          color: seasonalTheme.textSecondary,
                          fontSize: 12,
                          marginLeft: 3,
                        }}
                      >
                        {modelInfo.displayName}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={11}
                        color={seasonalTheme.textSecondary + "80"}
                        style={{ marginLeft: 1 }}
                      />
                    </TouchableOpacity>
                  )}
              </View>
              {isEntryScreen && activeEntryId && (
                <PopoverMenu
                  visible={showContentMenu}
                  onClose={() => setShowContentMenu(false)}
                  trigger={
                    <TouchableOpacity
                      onPress={() => setShowContentMenu(true)}
                      style={styles.headerMenuButton}
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color={seasonalTheme.textSecondary}
                      />
                    </TouchableOpacity>
                  }
                >
                  {currentScreen === "countdownViewer" && (
                    <MenuItem
                      icon="pencil-outline"
                      label="Edit Timer"
                      compact
                      onPress={() => {
                        setShowContentMenu(false);
                        if (activeEntryId) {
                          handleCountdownViewerEdit(activeEntryId);
                        }
                      }}
                    />
                  )}
                  <MenuItem
                    icon="trash-outline"
                    label="Delete"
                    variant="destructive"
                    compact
                    onPress={() => {
                      setShowContentMenu(false);
                      deleteEntryMutation.mutate(activeEntryId, {
                        onSuccess: () => {
                          setCurrentScreen("home");
                          setEditingEntryId(undefined);
                          setFullEditorEntryId(undefined);
                        },
                      });
                    }}
                  />
                </PopoverMenu>
              )}
            </View>

            {/* Content body */}
            <View style={styles.contentBody}>
              {isEntryScreen ? (
                renderContentPanel()
              ) : currentScreen === "settings" ? (
                <SettingsScreen
                  onNavigateToPlayground={handleNavigateToPlayground}
                  onNavigateToQuillEditor={handleNavigateToQuillEditor}
                  onBack={handleSettingsBack}
                  compact
                />
              ) : currentScreen === "playground" ? (
                <ComponentPlaygroundScreen onBack={handlePlaygroundBack} />
              ) : currentScreen === "quillEditor" ? (
                <QuillEditorScreen onBack={handleQuillEditorBack} />
              ) : (
                /* Empty state */
                <View
                  style={[
                    styles.emptyContentPanel,
                    { backgroundColor: seasonalTheme.gradient.middle },
                  ]}
                >
                  <Ionicons
                    name="journal-outline"
                    size={48}
                    color={seasonalTheme.textSecondary + "60"}
                  />
                  <Text
                    variant="h3"
                    style={{
                      color: seasonalTheme.textSecondary,
                      marginTop: spacingPatterns.md,
                      textAlign: "center",
                    }}
                  >
                    Select an entry
                  </Text>
                  <Text
                    variant="body"
                    style={{
                      color: seasonalTheme.textSecondary + "80",
                      marginTop: spacingPatterns.xs,
                      textAlign: "center",
                    }}
                  >
                    Or create a new note, AI chat, or countdown
                  </Text>
                  <View style={styles.emptyActions}>
                    <TouchableOpacity
                      style={[
                        styles.emptyActionButton,
                        {
                          backgroundColor: seasonalTheme.isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.05)",
                        },
                      ]}
                      onPress={() => handleOpenFullEditor()}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={theme.colors.accent}
                      />
                      <Text
                        variant="body"
                        style={{
                          color: seasonalTheme.textPrimary,
                          fontWeight: "500",
                          marginLeft: spacingPatterns.xs,
                        }}
                      >
                        New Note
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.emptyActionButton,
                        {
                          backgroundColor: seasonalTheme.isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(0,0,0,0.05)",
                        },
                      ]}
                      onPress={handleCreateNewAIChat}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="chatbubbles-outline"
                        size={20}
                        color={theme.colors.accent}
                      />
                      <Text
                        variant="body"
                        style={{
                          color: seasonalTheme.textPrimary,
                          fontWeight: "500",
                          marginLeft: spacingPatterns.xs,
                        }}
                      >
                        AI Chat
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        <SearchModal
          visible={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectEntry={handleSearchSelect}
        />
      </SafeAreaView>
    );
  }

  // Narrow screen: stacked navigation (original behavior)
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
  sidebarLayout: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 280,
    borderRightWidth: 1,
    // Absolute positioning gives a definite height from the parent,
    // so children (FlatList) scroll within bounds instead of stretching the row
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    flexDirection: "column",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flexShrink: 0,
    gap: 8,
  },
  logoIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  headerModelSelector: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacingPatterns.sm,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: borderRadius.sm,
  },
  headerMenuButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
  },
  contentBody: {
    flex: 1,
  },
  sidebarActions: {
    paddingHorizontal: spacingPatterns.xs,
    paddingTop: spacingPatterns.xs,
    paddingBottom: 4,
    flexShrink: 0,
  },
  sidebarActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: borderRadius.md,
  },
  sidebarList: {
    flex: 1,
    overflow: "hidden",
  },
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    flexShrink: 0,
  },
  contentPanel: {
    // Absolute positioning gives a definite height so ScrollView/FlatList
    // inside (e.g. Settings) scrolls within bounds
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 280,
  },
  emptyContentPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacingPatterns.xl,
  },
  emptyActions: {
    marginTop: spacingPatterns.lg,
    gap: spacingPatterns.sm,
  },
  emptyActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: 8,
  },
});
