import { Ionicons } from "@expo/vector-icons";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  BackHandler,
  Keyboard,
  Linking,
  TouchableOpacity,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Text, SearchModal, MenuItem, PopoverMenu } from "../components";
import { DrawerIcon } from "../components/icons/DrawerIcon";
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

  // Mobile drawer state
  const [drawerOpen, setDrawerOpen] = useState(true); // starts open on launch
  const drawerTranslateX = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(windowWidth * 0.85, 320);

  // Desktop sidebar collapsed state (icon-only rail)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const SIDEBAR_WIDTH = 280;
  const SIDEBAR_COLLAPSED_WIDTH = 52;
  // 0 = expanded, 1 = collapsed
  const sidebarAnim = useRef(new Animated.Value(0)).current;
  const sidebarAnimWidth = sidebarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH],
  });
  const sidebarContentOpacity = sidebarAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const toggleSidebar = useCallback(() => {
    const toCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(toCollapsed);
    Animated.spring(sidebarAnim, {
      toValue: toCollapsed ? 1 : 0,
      ...springPresets.modal,
      useNativeDriver: false,
    }).start();
  }, [sidebarCollapsed, sidebarAnim]);

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

  // Drawer close gesture: drag left on the open drawer to dismiss
  const drawerClosePanRef = useRef<ReturnType<
    typeof PanResponder.create
  > | null>(null);

  useEffect(() => {
    drawerClosePanRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const isHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        if (!isHorizontal) return false;
        // Only respond to leftward swipes
        if (gestureState.dx > -10) return false;
        return true;
      },
      onPanResponderTerminationRequest: (_evt, gestureState) => {
        const isVertical =
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVertical;
      },
      onPanResponderMove: (_evt, gestureState) => {
        // Map leftward drag to translateX (0..-drawerWidth)
        const dx = Math.min(0, gestureState.dx);
        drawerTranslateX.setValue(dx);
        backdropOpacity.setValue(1 + dx / drawerWidthRef.current);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const threshold = drawerWidthRef.current * 0.3;
        if (gestureState.dx < -threshold || gestureState.vx < -0.3) {
          // Complete close
          Animated.parallel([
            Animated.spring(drawerTranslateX, {
              toValue: -drawerWidthRef.current,
              ...springPresets.modal,
              useNativeDriver: false,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: false,
            }),
          ]).start(() => setDrawerOpen(false));
        } else {
          // Snap back open
          Animated.parallel([
            Animated.spring(drawerTranslateX, {
              toValue: 0,
              ...springPresets.modal,
              useNativeDriver: false,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            }),
          ]).start();
        }
      },
    });
  }, [drawerTranslateX, backdropOpacity]);

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
  const insets = useSafeAreaInsets();
  const syncAuth = useSyncAuthContext();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showContentMenu, setShowContentMenu] = useState(false);
  const [modelInfo, setModelInfo] = useState<{
    displayName: string;
    openSelector: () => void;
  } | null>(null);
  const deleteEntryMutation = useDeleteEntry();

  // Drawer open/close helpers (mobile only)
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  const openDrawer = useCallback(() => {
    // Dismiss keyboard so it doesn't stay open behind the drawer
    Keyboard.dismiss();
    if (
      Platform.OS === "web" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    setDrawerOpen(true);
    Animated.parallel([
      Animated.spring(drawerTranslateX, {
        toValue: 0,
        ...springPresets.modal,
        useNativeDriver: false,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }),
    ]).start();
  }, [drawerTranslateX, backdropOpacity]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.spring(drawerTranslateX, {
        toValue: -drawerWidthRef.current,
        ...springPresets.modal,
        useNativeDriver: false,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setDrawerOpen(false);
    });
  }, [drawerTranslateX, backdropOpacity]);

  // Sidebar actions that also close the drawer on mobile
  const closeDrawerRef = useRef(closeDrawer);
  closeDrawerRef.current = closeDrawer;

  const handleSidebarEntryPress = useCallback(
    (entryId: number, entryType?: "journal" | "ai_chat" | "countdown") => {
      handleOpenEntryEditor(entryId, entryType);
      closeDrawerRef.current();
    },
    [handleOpenEntryEditor],
  );

  const handleSidebarOpenFullEditor = useCallback(
    (initialText?: string) => {
      handleOpenFullEditor(initialText);
      closeDrawerRef.current();
    },
    [handleOpenFullEditor],
  );

  const handleSidebarCreateNewAIChat = useCallback(() => {
    handleCreateNewAIChat();
    closeDrawerRef.current();
  }, [handleCreateNewAIChat]);

  const handleSidebarCreateCountdown = useCallback(() => {
    handleCreateCountdown();
    closeDrawerRef.current();
  }, [handleCreateCountdown]);

  const handleSidebarOpenSettings = useCallback(() => {
    handleOpenSettings();
    closeDrawerRef.current();
  }, [handleOpenSettings]);

  const handleSidebarSearchSelect = useCallback(
    (entryId: number, entryType: "journal" | "ai_chat" | "countdown") => {
      handleOpenEntryEditor(entryId, entryType);
      closeDrawerRef.current();
    },
    [handleOpenEntryEditor],
  );

  // Suppress keyboard/focus while drawer is open (prevents race with editor auto-focus)
  useEffect(() => {
    if (!drawerOpen || isWideScreen) return;

    if (Platform.OS === "web") {
      const handler = () => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      };
      document.addEventListener("focusin", handler);
      return () => document.removeEventListener("focusin", handler);
    } else {
      const sub = Keyboard.addListener("keyboardDidShow", () => {
        Keyboard.dismiss();
      });
      return () => sub.remove();
    }
  }, [drawerOpen, isWideScreen]);

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

  // Auto-select first entry when nothing is selected (both mobile and desktop)
  const handleFirstEntryAvailable = useCallback(
    (entryId: number, entryType: string) => {
      if (currentScreen === "home") {
        handleOpenEntryEditor(
          entryId,
          entryType as "journal" | "ai_chat" | "countdown",
        );
      }
    },
    [currentScreen, handleOpenEntryEditor],
  );

  // Check if current screen is an entry-level screen (shown in content panel on wide)
  const isEntryScreen =
    currentScreen === "entryEditor" ||
    currentScreen === "fullEditor" ||
    currentScreen === "countdownViewer" ||
    currentScreen === "countdownComposer" ||
    currentScreen === "composer";

  // Render content panel (used by both desktop sidebar and mobile drawer layouts)
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
          {/* Sidebar — animated width */}
          <Animated.View
            style={[
              styles.sidebar,
              {
                width: sidebarAnimWidth,
                borderRightColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)",
              },
            ]}
          >
            {/* Sidebar header — logo always visible, "Jot" fades */}
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
              <Animated.View style={{ opacity: sidebarContentOpacity }}>
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Jot
                </Text>
              </Animated.View>
            </View>

            {/* Action buttons — icons stay in place, text fades out */}
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
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                    opacity: sidebarContentOpacity,
                  }}
                >
                  New Note
                </Animated.Text>
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
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                    opacity: sidebarContentOpacity,
                  }}
                >
                  New AI Chat
                </Animated.Text>
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
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                    opacity: sidebarContentOpacity,
                  }}
                >
                  New Countdown
                </Animated.Text>
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
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 13,
                    marginLeft: 8,
                    flex: 1,
                    opacity: sidebarContentOpacity,
                  }}
                >
                  Search
                </Animated.Text>
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textSecondary + "80",
                    fontSize: 11,
                    opacity: sidebarContentOpacity,
                  }}
                >
                  {"\u2318K"}
                </Animated.Text>
              </TouchableOpacity>
            </View>

            {/* Entry list — fades out when collapsed */}
            <Animated.View
              style={[styles.sidebarList, { opacity: sidebarContentOpacity }]}
              pointerEvents={sidebarCollapsed ? "none" : "auto"}
            >
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
            </Animated.View>

            {/* Settings bar at bottom — icon always visible, text fades */}
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
              <Animated.View
                style={{
                  opacity: sidebarContentOpacity,
                  flex: 1,
                  marginLeft: 8,
                }}
              >
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textSecondary,
                    fontSize: 13,
                  }}
                >
                  {syncAuth.state.status === "authenticated" &&
                  syncAuth.state.settings?.email
                    ? syncAuth.state.settings.email
                    : "Settings"}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>

          {/* Content panel — animated left offset */}
          <Animated.View
            style={[styles.contentPanel, { left: sidebarAnimWidth }]}
          >
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
              {/* Sidebar collapse/expand toggle */}
              <TouchableOpacity
                onPress={toggleSidebar}
                style={styles.headerMenuButton}
                activeOpacity={0.7}
              >
                <DrawerIcon size={18} color={seasonalTheme.textSecondary} />
              </TouchableOpacity>
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
          </Animated.View>
        </View>

        <SearchModal
          visible={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectEntry={handleSearchSelect}
        />
      </SafeAreaView>
    );
  }

  // Narrow screen: drawer sidebar + full-width content panel
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
        {/* Content panel (full width, always visible) */}
        <View style={styles.mobileContentPanel}>
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
            {/* Drawer toggle */}
            <TouchableOpacity
              onPress={openDrawer}
              style={styles.headerMenuButton}
              activeOpacity={0.7}
            >
              <DrawerIcon size={20} color={seasonalTheme.textPrimary} />
            </TouchableOpacity>

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

        {/* Drawer backdrop */}
        {drawerOpen && (
          <Animated.View
            style={[
              styles.mobileDrawerBackdrop,
              {
                opacity: backdropOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
                backgroundColor: "#000",
              },
            ]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={closeDrawer}
            />
          </Animated.View>
        )}

        {/* Sidebar drawer */}
        {drawerOpen && (
          <Animated.View
            style={[
              styles.mobileDrawer,
              {
                width: drawerWidth,
                backgroundColor: seasonalTheme.gradient.middle,
                borderRightColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)",
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
            {...(drawerClosePanRef.current?.panHandlers || {})}
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
                onPress={() => handleSidebarOpenFullEditor()}
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
                onPress={handleSidebarCreateNewAIChat}
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
                onPress={handleSidebarCreateCountdown}
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
                onPress={() => {
                  setShowSearchModal(true);
                  closeDrawer();
                }}
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
              </TouchableOpacity>
            </View>

            {/* Entry list */}
            <View style={styles.sidebarList}>
              <HomeScreen
                refreshKey={_homeRefreshKey}
                isVisible={true}
                onOpenFullEditor={handleSidebarOpenFullEditor}
                onOpenSettings={handleSidebarOpenSettings}
                onOpenEntryEditor={handleSidebarEntryPress}
                onEditCountdown={handleCountdownViewerEdit}
                onCreateNewAIChat={handleSidebarCreateNewAIChat}
                onCreateCountdown={handleSidebarCreateCountdown}
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
                  paddingBottom: Math.max(10, insets.bottom),
                  borderTopColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
              onPress={handleSidebarOpenSettings}
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
          </Animated.View>
        )}
      </View>

      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectEntry={handleSidebarSearchSelect}
      />
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
  mobileContentPanel: {
    flex: 1,
    zIndex: 1,
  },
  mobileDrawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  mobileDrawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: "column",
    borderRightWidth: 1,
    zIndex: 20,
  },
  sidebarLayout: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    // width is set dynamically based on sidebarCollapsed
    borderRightWidth: 1,
    // Absolute positioning gives a definite height from the parent,
    // so children (FlatList) scroll within bounds instead of stretching the row
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    flexDirection: "column",
    overflow: "hidden",
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
    paddingHorizontal: 16,
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
    // left is set dynamically based on sidebarCollapsed
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
