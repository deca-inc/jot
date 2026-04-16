import { Ionicons } from "@expo/vector-icons";
import { Slot, router, usePathname, useGlobalSearchParams } from "expo-router";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  BackHandler,
  Keyboard,
  TouchableOpacity,
  Pressable,
  Image,
  Platform,
  TextInput,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Text,
  SearchModal,
  MenuItem,
  PopoverMenu,
  Dialog,
} from "../../lib/components";
import { DrawerIcon } from "../../lib/components/icons/DrawerIcon";
import { PinIcon } from "../../lib/components/icons/PinIcon";
import { extractPreviewText } from "../../lib/db/entries";
import {
  useEntry,
  useEntries,
  useDeleteEntry,
  useUpdateEntry,
  useToggleFavorite,
  useTogglePinned,
  useArchiveEntry,
  useUnarchiveEntry,
} from "../../lib/db/useEntries";
import { useIsWideScreen } from "../../lib/hooks/useIsWideScreen";
import { useUpdateChecker } from "../../lib/hooks/useUpdateChecker";
import {
  ModelInfoProvider,
  useModelInfo,
} from "../../lib/navigation/ModelInfoContext";
import { HomeScreen } from "../../lib/screens";
import { useSyncAuthContext } from "../../lib/sync/SyncAuthProvider";
import { useSyncEngine } from "../../lib/sync/useSyncEngine";
import { borderRadius, spacingPatterns } from "../../lib/theme";
import { springPresets } from "../../lib/theme";
import { useSeasonalTheme } from "../../lib/theme/SeasonalThemeProvider";
import { useTheme } from "../../lib/theme/ThemeProvider";
import { blurEditors } from "../../lib/utils/blur-editors";
import { requestSave } from "../../lib/utils/request-save";

const appIcon = require("../../assets/icon.png") as number;

/**
 * Renders a Pressable that is a real <a> link on web (supports ctrl/cmd+click
 * for new tab) or a TouchableOpacity on native. Normal clicks use router.push
 * via onPress; modifier-clicks pass through as native link navigations.
 */
function SidebarLink({
  href,
  onPress,
  style,
  children,
}: {
  href: string;
  onPress: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet types vary across platforms
  style?: any;
  children: React.ReactNode;
}) {
  if (Platform.OS === "web") {
    return (
      <Pressable
        // @ts-expect-error -- web-only: RNW Pressable supports href to render as <a>
        href={href}
        onPress={(e: { preventDefault?: () => void }) => {
          // Access the native event to check modifier keys
          const nativeEvent = (e as unknown as { nativeEvent?: MouseEvent })
            .nativeEvent;
          if (
            nativeEvent &&
            (nativeEvent.metaKey ||
              nativeEvent.ctrlKey ||
              nativeEvent.shiftKey ||
              nativeEvent.button === 1)
          )
            return;
          e.preventDefault?.();
          onPress();
        }}
        accessibilityRole="link"
        style={style}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={style}>
      {children}
    </TouchableOpacity>
  );
}

export default function MainLayoutWrapper() {
  return (
    <ModelInfoProvider>
      <MainLayout />
    </ModelInfoProvider>
  );
}

function MainLayout() {
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const isWideScreen = useIsWideScreen();
  const insets = useSafeAreaInsets();
  const syncAuth = useSyncAuthContext();
  const syncEngine = useSyncEngine();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ parentId?: string }>();
  const updateCheck = useUpdateChecker();

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showContentMenu, setShowContentMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { modelInfo, composerEntryId } = useModelInfo();
  const deleteEntryMutation = useDeleteEntry();
  const updateEntryMutation = useUpdateEntry();
  const toggleFavoriteMutation = useToggleFavorite();
  const togglePinnedMutation = useTogglePinned();
  const archiveEntryMutation = useArchiveEntry();
  const unarchiveEntryMutation = useUnarchiveEntry();
  const updateEntryRef = useRef(updateEntryMutation);
  updateEntryRef.current = updateEntryMutation;
  const screenWidth = useRef(0);

  // Inline title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState("");
  const titleInputRef = useRef<TextInput>(null);

  // Derive active entry ID from the current route
  const activeEntryId = (() => {
    const entryMatch = pathname.match(/^\/entry\/(\d+)/);
    if (entryMatch) return Number(entryMatch[1]);
    return undefined;
  })();

  // Determine current screen type from pathname
  const isEntryScreen =
    pathname.startsWith("/entry/") || pathname.startsWith("/compose/");
  const _isCountdownViewer = pathname.startsWith("/entry/");
  const isSettings = pathname === "/settings";
  const isPlayground = pathname === "/playground";
  const isCountdownComposer = pathname.startsWith("/compose/countdown");

  // Fetch active entry for content header title
  const activeEntryQuery = useEntry(activeEntryId);
  const activeEntryTitle = activeEntryQuery.data?.title || "";
  // parentId from the entry data, or from URL query params during compose
  const activeEntryParentId =
    activeEntryQuery.data?.parentId ??
    (globalParams.parentId ? Number(globalParams.parentId) : undefined);
  const activeEntryType = activeEntryQuery.data?.type;

  // While the user is on /compose/chat and the composer has created a new
  // entry in-place (no URL change), fetch that entry so the header can show
  // its live title instead of the static "New Chat" placeholder.
  const composerEntryQuery = useEntry(composerEntryId);
  const composerEntryTitle = composerEntryQuery.data?.title || "";

  // Fetch recent entries for mobile empty state
  const recentEntriesQuery = useEntries({ limit: 5 });
  const recentEntries = recentEntriesQuery.data ?? [];

  // Fetch parent entry for breadcrumb
  const parentEntryQuery = useEntry(activeEntryParentId);
  const parentEntryTitle =
    parentEntryQuery.data?.title || (activeEntryParentId ? "Untitled" : "");

  // Mobile drawer state — always start closed for a clean launch experience
  const { width: windowWidth } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTranslateX = useRef(
    new Animated.Value(-Math.min(windowWidth * 0.85, 320)),
  ).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const drawerWidth = Math.min(windowWidth * 0.85, 320);
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  // Desktop sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const SIDEBAR_WIDTH = 280;
  const SIDEBAR_COLLAPSED_WIDTH = 52;
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

  // Drawer open/close helpers
  const openDrawer = useCallback(() => {
    Keyboard.dismiss();
    blurEditors.emit();
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

  const closeDrawerRef = useRef(closeDrawer);
  closeDrawerRef.current = closeDrawer;

  // Drawer close gesture
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
        if (gestureState.dx > -10) return false;
        return true;
      },
      onPanResponderTerminationRequest: (_evt, gestureState) => {
        const isVertical =
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVertical;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const dx = Math.min(0, gestureState.dx);
        drawerTranslateX.setValue(dx);
        backdropOpacity.setValue(1 + dx / drawerWidthRef.current);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const threshold = drawerWidthRef.current * 0.3;
        if (gestureState.dx < -threshold || gestureState.vx < -0.3) {
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

  // Drawer open gesture (swipe from left edge of content panel)
  const drawerOpenPanRef = useRef<ReturnType<
    typeof PanResponder.create
  > | null>(null);
  const drawerOpenActiveRef = useRef(false);

  useEffect(() => {
    drawerOpenPanRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only capture right-swipes starting near the left edge
        const startX = evt.nativeEvent.pageX - gestureState.dx;
        if (startX > 30) return false;
        const isHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        if (!isHorizontal) return false;
        if (gestureState.dx < 10) return false;
        return true;
      },
      onPanResponderGrant: () => {
        drawerOpenActiveRef.current = true;
        setDrawerOpen(true);
        Keyboard.dismiss();
        blurEditors.emit();
        if (
          Platform.OS === "web" &&
          document.activeElement instanceof HTMLElement
        ) {
          document.activeElement.blur();
        }
      },
      onPanResponderMove: (_evt, gestureState) => {
        const dx = Math.min(gestureState.dx, drawerWidthRef.current);
        const progress = dx / drawerWidthRef.current;
        drawerTranslateX.setValue(-drawerWidthRef.current + dx);
        backdropOpacity.setValue(progress);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        drawerOpenActiveRef.current = false;
        const threshold = drawerWidthRef.current * 0.3;
        if (gestureState.dx > threshold || gestureState.vx > 0.3) {
          // Complete the open
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
        } else {
          // Snap back closed
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
        }
      },
    });
  }, [drawerTranslateX, backdropOpacity]);

  // Handle hardware back button (Android)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (router.canGoBack()) {
          router.back();
          return true;
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, []);

  // Cmd+K / Ctrl+K to open search (web only)
  useEffect(() => {
    if (!isWideScreen || Platform.OS !== "web") return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearchModal((v) => !v);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isWideScreen]);

  // Navigation helpers
  const navigateToEntry = useCallback(
    (entryId: number, entryType?: "journal" | "ai_chat" | "countdown") => {
      if (entryType === "countdown") {
        router.push(`/(main)/entry/${entryId}`);
      } else {
        router.push(`/(main)/entry/${entryId}`);
      }
    },
    [],
  );

  const handleOpenFullEditor = useCallback((initialText?: string) => {
    const content = (initialText || "").trim();
    if (content) {
      router.push(
        `/(main)/compose/journal?initialText=${encodeURIComponent(content)}`,
      );
    } else {
      router.push("/(main)/compose/journal");
    }
  }, []);

  const handleCreateNewAIChat = useCallback(() => {
    router.push("/(main)/compose/chat");
  }, []);

  const handleCreateCountdown = useCallback(() => {
    router.push("/(main)/compose/countdown");
  }, []);

  const handleOpenSettings = useCallback(() => {
    router.push("/(main)/settings");
  }, []);

  const handleSearchSelect = useCallback(
    (entryId: number, entryType: "journal" | "ai_chat" | "countdown") => {
      navigateToEntry(entryId, entryType);
    },
    [navigateToEntry],
  );

  // Sidebar navigation wrappers (also close drawer on mobile)
  const handleSidebarEntryPress = useCallback(
    (entryId: number, entryType?: "journal" | "ai_chat" | "countdown") => {
      navigateToEntry(entryId, entryType);
      closeDrawerRef.current();
    },
    [navigateToEntry],
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
      navigateToEntry(entryId, entryType);
      closeDrawerRef.current();
    },
    [navigateToEntry],
  );

  // Auto-select first entry (desktop only — mobile shows empty state)
  const handleFirstEntryAvailable = useCallback(
    (entryId: number, entryType: string) => {
      if (isWideScreen && (pathname === "/" || pathname === "")) {
        navigateToEntry(
          entryId,
          entryType as "journal" | "ai_chat" | "countdown",
        );
      }
    },
    [isWideScreen, pathname, navigateToEntry],
  );

  const handleNoEntries = useCallback(() => {
    // No-op: drawer already starts closed on mount, so no action needed.
    // Closing the drawer here would prevent users with zero entries from
    // ever opening the sidebar (HomeScreen remounts each time the drawer
    // opens, re-triggering this callback).
  }, []);

  const handleSidebarDeleteEntry = useCallback(
    (entryId: number) => {
      if (entryId === activeEntryId) {
        router.replace("/(main)");
      }
    },
    [activeEntryId],
  );

  const handleCountdownViewerEdit = useCallback((entryId: number) => {
    router.push(`/(main)/compose/countdown?editId=${entryId}`);
  }, []);

  // Delete active entry
  const handleDeleteActiveEntry = useCallback(() => {
    if (!activeEntryId) return;
    setShowDeleteConfirm(false);
    router.replace("/(main)");
    deleteEntryMutation.mutate(activeEntryId);
  }, [activeEntryId, deleteEntryMutation]);

  // Determine content header title
  const getHeaderTitle = () => {
    if (isSettings) return "Settings";
    if (isPlayground) return "Component Playground";
    if (isCountdownComposer) {
      const editMatch = pathname.match(/editId=(\d+)/);
      return editMatch ? "Edit Timer" : "New Timer";
    }
    if (pathname === "/compose/chat") {
      return composerEntryTitle || "New Chat";
    }
    // For journal entries, treat "Untitled" as no title — show preview instead
    const raw = activeEntryTitle || "";
    if (raw === "Untitled" && activeEntryType === "journal") {
      const preview = activeEntryQuery.data
        ? extractPreviewText(activeEntryQuery.data.blocks)
        : "";
      return preview || "";
    }
    return raw;
  };

  // The entry whose title is displayed in the header.
  const editableEntryId =
    pathname === "/compose/chat" ? composerEntryId : activeEntryId;

  // Whether the current header title is editable (entries and composer).
  const isTitleEditable = isEntryScreen && editableEntryId !== undefined;

  const handleTitleTap = useCallback(() => {
    if (!isTitleEditable) return;
    const currentTitle =
      pathname === "/compose/chat" ? composerEntryTitle : activeEntryTitle;
    // If title is the default sentinel, start with empty input (placeholder will show)
    const isDefault = !currentTitle || currentTitle === "Untitled";
    setEditingTitleText(isDefault ? "" : currentTitle);
    setIsEditingTitle(true);
    // Focus the TextInput after state update
    setTimeout(() => titleInputRef.current?.focus(), 50);
  }, [isTitleEditable, pathname, composerEntryTitle, activeEntryTitle]);

  // Dismiss editing when navigating to a different entry
  const prevEditableEntryIdRef = useRef(editableEntryId);
  if (prevEditableEntryIdRef.current !== editableEntryId) {
    prevEditableEntryIdRef.current = editableEntryId;
    if (isEditingTitle) {
      setIsEditingTitle(false);
    }
  }

  const handleTitleSubmit = useCallback(() => {
    const trimmed = editingTitleText.trim();
    setIsEditingTitle(false);
    if (!editableEntryId) return;

    if (trimmed) {
      // User set a custom title — pin it
      updateEntryRef.current.mutate({
        id: editableEntryId,
        input: { title: trimmed, titlePinned: true },
      });
    } else {
      // User cleared the title — revert to auto-generated title (unpin)
      updateEntryRef.current.mutate({
        id: editableEntryId,
        input: { title: "Untitled", titlePinned: false },
      });
    }
  }, [editingTitleText, editableEntryId]);

  // Render the content header (shared between desktop and mobile)
  const renderContentHeader = (showDrawerToggle: boolean) => (
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
      <TouchableOpacity
        onPress={showDrawerToggle ? openDrawer : toggleSidebar}
        style={styles.headerMenuButton}
        activeOpacity={0.7}
      >
        <DrawerIcon
          size={showDrawerToggle ? 20 : 18}
          color={
            showDrawerToggle
              ? seasonalTheme.textPrimary
              : seasonalTheme.textSecondary
          }
        />
      </TouchableOpacity>
      <View style={styles.headerTitleRow}>
        {isEntryScreen && activeEntryParentId && parentEntryTitle ? (
          <>
            <TouchableOpacity
              onPress={async () => {
                await requestSave.emit();
                navigateToEntry(
                  activeEntryParentId,
                  parentEntryQuery.data?.type as
                    | "journal"
                    | "ai_chat"
                    | "countdown",
                );
              }}
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
            {isEditingTitle ? (
              <TextInput
                ref={titleInputRef}
                value={editingTitleText}
                onChangeText={setEditingTitleText}
                onSubmitEditing={handleTitleSubmit}
                onBlur={handleTitleSubmit}
                placeholder="Title"
                placeholderTextColor={seasonalTheme.textSecondary + "80"}
                style={[
                  {
                    color: seasonalTheme.textPrimary,
                    fontWeight: "600",
                    fontSize: 14,
                    padding: 0,
                    margin: 0,
                    borderWidth: 0,
                    flexShrink: 1,
                    minWidth: 40,
                    height: 32,
                  },

                  {
                    outlineStyle: "none",
                    background: "transparent",
                    verticalAlign: "middle",
                  } as unknown as Record<string, string>,
                ]}
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity
                onPress={handleTitleTap}
                activeOpacity={0.7}
                style={{ flexShrink: 1, minWidth: 0 }}
              >
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {activeEntryTitle || ""}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : isEditingTitle && isTitleEditable ? (
          <TextInput
            ref={titleInputRef}
            value={editingTitleText}
            onChangeText={setEditingTitleText}
            onSubmitEditing={handleTitleSubmit}
            onBlur={handleTitleSubmit}
            placeholder="Title"
            placeholderTextColor={seasonalTheme.textSecondary + "80"}
            style={[
              {
                color: seasonalTheme.textPrimary,
                fontWeight: "600",
                fontSize: 15,
                padding: 0,
                margin: 0,
                borderWidth: 0,
                flexShrink: 1,
                minWidth: 40,
                height: 32,
              },

              {
                outlineStyle: "none",
                background: "transparent",
                verticalAlign: "middle",
              } as unknown as Record<string, string>,
            ]}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity
            onPress={isTitleEditable ? handleTitleTap : undefined}
            activeOpacity={isTitleEditable ? 0.7 : 1}
            disabled={!isTitleEditable}
            style={{ flexShrink: 1, minWidth: 0 }}
          >
            <Text
              variant="body"
              numberOfLines={1}
              style={{
                color: seasonalTheme.textPrimary,
                fontWeight: "600",
                fontSize: 15,
              }}
            >
              {getHeaderTitle()}
            </Text>
          </TouchableOpacity>
        )}
        {/* Model selector in header for AI chats */}
        {(activeEntryType === "ai_chat" || pathname === "/compose/chat") &&
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
          {activeEntryType === "countdown" && (
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
            compact
            icon={activeEntryQuery.data?.isFavorite ? "star" : "star-outline"}
            label={
              activeEntryQuery.data?.isFavorite ? "Unfavorite" : "Favorite"
            }
            onPress={() => {
              setShowContentMenu(false);
              if (activeEntryId) {
                toggleFavoriteMutation.mutate(activeEntryId);
              }
            }}
          />
          <MenuItem
            compact
            customIcon={<PinIcon size={16} color={seasonalTheme.textPrimary} />}
            label={activeEntryQuery.data?.isPinned ? "Unpin" : "Pin"}
            onPress={() => {
              setShowContentMenu(false);
              if (activeEntryId) {
                togglePinnedMutation.mutate(activeEntryId);
              }
            }}
          />
          <MenuItem
            compact
            icon={
              activeEntryQuery.data?.archivedAt
                ? "arrow-undo-outline"
                : "archive-outline"
            }
            label={activeEntryQuery.data?.archivedAt ? "Unarchive" : "Archive"}
            onPress={() => {
              setShowContentMenu(false);
              if (activeEntryId) {
                if (activeEntryQuery.data?.archivedAt) {
                  unarchiveEntryMutation.mutate(activeEntryId);
                } else {
                  archiveEntryMutation.mutate(activeEntryId);
                }
              }
            }}
          />
          <MenuItem
            icon="trash-outline"
            label="Delete"
            variant="destructive"
            compact
            onPress={() => {
              setShowContentMenu(false);
              setShowDeleteConfirm(true);
            }}
          />
        </PopoverMenu>
      )}
    </View>
  );

  // Render sidebar content (shared between desktop sidebar and mobile drawer)
  const renderSidebarContent = (isMobile: boolean) => {
    const entryPressHandler = isMobile
      ? handleSidebarEntryPress
      : navigateToEntry;
    const fullEditorHandler = isMobile
      ? handleSidebarOpenFullEditor
      : handleOpenFullEditor;
    const newAIChatHandler = isMobile
      ? handleSidebarCreateNewAIChat
      : handleCreateNewAIChat;
    const countdownHandler = isMobile
      ? handleSidebarCreateCountdown
      : handleCreateCountdown;
    const settingsHandler = isMobile
      ? handleSidebarOpenSettings
      : handleOpenSettings;
    const searchHandler = isMobile
      ? () => {
          setShowSearchModal(true);
          closeDrawer();
        }
      : () => setShowSearchModal(true);

    return (
      <>
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
          {isMobile ? (
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
          ) : (
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
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.sidebarActions}>
          <SidebarLink
            href="/(main)/compose/journal"
            onPress={() => fullEditorHandler()}
            style={styles.sidebarActionButton}
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={seasonalTheme.textPrimary}
            />
            {isMobile ? (
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                }}
              >
                New Note
              </Text>
            ) : (
              <Animated.Text
                numberOfLines={1}
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                  opacity: sidebarContentOpacity,
                }}
              >
                New Note
              </Animated.Text>
            )}
          </SidebarLink>
          <SidebarLink
            href="/(main)/compose/chat"
            onPress={newAIChatHandler}
            style={styles.sidebarActionButton}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={18}
              color={seasonalTheme.textPrimary}
            />
            {isMobile ? (
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                }}
              >
                New AI Chat
              </Text>
            ) : (
              <Animated.Text
                numberOfLines={1}
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                  opacity: sidebarContentOpacity,
                }}
              >
                New AI Chat
              </Animated.Text>
            )}
          </SidebarLink>
          <SidebarLink
            href="/(main)/compose/countdown"
            onPress={countdownHandler}
            style={styles.sidebarActionButton}
          >
            <Ionicons
              name="timer-outline"
              size={18}
              color={seasonalTheme.textPrimary}
            />
            {isMobile ? (
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                }}
              >
                New Countdown
              </Text>
            ) : (
              <Animated.Text
                numberOfLines={1}
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                  opacity: sidebarContentOpacity,
                }}
              >
                New Countdown
              </Animated.Text>
            )}
          </SidebarLink>
          <TouchableOpacity
            style={styles.sidebarActionButton}
            onPress={searchHandler}
            activeOpacity={0.7}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={seasonalTheme.textPrimary}
            />
            {isMobile ? (
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textPrimary,
                  fontSize: 14,
                  marginLeft: 8,
                  flex: 1,
                }}
              >
                Search
              </Text>
            ) : (
              <>
                <Animated.Text
                  numberOfLines={1}
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontSize: 14,
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
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Entry list */}
        {isMobile ? (
          <View style={styles.sidebarList}>
            <HomeScreen
              isVisible={true}
              onOpenFullEditor={fullEditorHandler}
              onOpenSettings={settingsHandler}
              onOpenEntryEditor={entryPressHandler}
              onEditCountdown={handleCountdownViewerEdit}
              onCreateNewAIChat={newAIChatHandler}
              onCreateCountdown={countdownHandler}
              selectedEntryId={activeEntryId}
              onFirstEntryAvailable={handleFirstEntryAvailable}
              onNoEntries={handleNoEntries}
              onDeleteEntry={handleSidebarDeleteEntry}
              compact
            />
          </View>
        ) : (
          <Animated.View
            style={[styles.sidebarList, { opacity: sidebarContentOpacity }]}
            pointerEvents={sidebarCollapsed ? "none" : "auto"}
          >
            <HomeScreen
              isVisible={true}
              onOpenFullEditor={fullEditorHandler}
              onOpenSettings={settingsHandler}
              onOpenEntryEditor={entryPressHandler}
              onEditCountdown={handleCountdownViewerEdit}
              onCreateNewAIChat={newAIChatHandler}
              onCreateCountdown={countdownHandler}
              selectedEntryId={activeEntryId}
              onFirstEntryAvailable={handleFirstEntryAvailable}
              onNoEntries={handleNoEntries}
              onDeleteEntry={handleSidebarDeleteEntry}
              compact
            />
          </Animated.View>
        )}

        {/* Update banner */}
        {(updateCheck.state.status === "available" ||
          updateCheck.state.status === "downloading" ||
          updateCheck.state.status === "ready") && (
          <TouchableOpacity
            onPress={updateCheck.install}
            activeOpacity={0.7}
            style={[
              styles.updateBanner,
              {
                backgroundColor: seasonalTheme.isDark
                  ? "rgba(59, 130, 246, 0.15)"
                  : "rgba(59, 130, 246, 0.1)",
                borderTopColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <Ionicons
              name={
                updateCheck.state.status === "ready"
                  ? "checkmark-circle"
                  : updateCheck.state.status === "downloading"
                    ? "cloud-download"
                    : "arrow-up-circle"
              }
              size={16}
              color="#3B82F6"
            />
            {isMobile ? (
              <Text
                variant="caption"
                numberOfLines={1}
                style={styles.updateBannerText}
              >
                {updateCheck.state.status === "ready"
                  ? `v${updateCheck.state.info.version} ready — tap to install`
                  : updateCheck.state.status === "downloading"
                    ? `Downloading v${updateCheck.state.info.version}… ${updateCheck.state.progress}%`
                    : `v${updateCheck.state.info.version} available — tap to update`}
              </Text>
            ) : (
              <Animated.View
                style={{ opacity: sidebarContentOpacity, flex: 1 }}
              >
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={styles.updateBannerText}
                >
                  {updateCheck.state.status === "ready"
                    ? `v${updateCheck.state.info.version} ready — click to install`
                    : updateCheck.state.status === "downloading"
                      ? `Downloading v${updateCheck.state.info.version}… ${updateCheck.state.progress}%`
                      : `v${updateCheck.state.info.version} available — click to update`}
                </Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        )}

        {/* Settings footer */}
        <SidebarLink
          href="/(main)/settings"
          onPress={settingsHandler}
          style={[
            styles.sidebarFooter,
            {
              paddingBottom: isMobile ? Math.max(10, insets.bottom) : 10,
              borderTopColor: seasonalTheme.isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          <View>
            <Ionicons
              name="settings-outline"
              size={18}
              color={seasonalTheme.textSecondary}
            />
            {syncEngine.status === "error" ? (
              <View style={styles.syncErrorBadge}>
                <Ionicons name="warning" size={10} color="#FFB400" />
              </View>
            ) : updateCheck.state.status === "available" ||
              updateCheck.state.status === "ready" ? (
              <View
                style={[
                  styles.updateDot,
                  {
                    backgroundColor:
                      updateCheck.state.status === "ready"
                        ? "#22C55E"
                        : "#3B82F6",
                  },
                ]}
              />
            ) : null}
          </View>
          {isMobile ? (
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
          ) : (
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
          )}
        </SidebarLink>
      </>
    );
  };

  // Render the empty state
  const renderEmptyState = () => (
    <View
      style={[
        styles.emptyContentPanel,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginTop: spacingPatterns.md,
          textAlign: "center",
          fontWeight: "600",
        }}
      >
        What would you like to create?
      </Text>
      <View style={styles.emptyActions}>
        <TouchableOpacity
          style={[
            styles.emptyActionButton,
            {
              backgroundColor: seasonalTheme.isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
          ]}
          onPress={() => handleOpenFullEditor()}
          activeOpacity={0.7}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={theme.colors.accent}
          />
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textPrimary,
              fontWeight: "500",
              fontSize: 14,
              marginLeft: 6,
            }}
          >
            Note
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.emptyActionButton,
            {
              backgroundColor: seasonalTheme.isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
          ]}
          onPress={handleCreateNewAIChat}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={16}
            color={theme.colors.accent}
          />
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textPrimary,
              fontWeight: "500",
              fontSize: 14,
              marginLeft: 6,
            }}
          >
            AI Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.emptyActionButton,
            {
              backgroundColor: seasonalTheme.isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
          ]}
          onPress={handleCreateCountdown}
          activeOpacity={0.7}
        >
          <Ionicons
            name="timer-outline"
            size={16}
            color={theme.colors.accent}
          />
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textPrimary,
              fontWeight: "500",
              fontSize: 14,
              marginLeft: 6,
            }}
          >
            Countdown
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recent entries — fixed height to prevent layout shift while loading */}
      <View style={styles.recentSection}>
        {recentEntries.length > 0 && (
          <>
            <Text
              variant="caption"
              style={{
                color: seasonalTheme.textSecondary,
                fontSize: 12,
                fontWeight: "600",
                marginBottom: spacingPatterns.xs,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Recents
            </Text>
            {recentEntries.map((entry) => {
              const preview =
                entry.title ||
                extractPreviewText(entry.blocks) ||
                (entry.type === "ai_chat" ? "AI Chat" : "Untitled");
              const icon =
                entry.type === "ai_chat"
                  ? "chatbubbles-outline"
                  : entry.type === "countdown"
                    ? "timer-outline"
                    : "document-text-outline";
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.recentItem}
                  onPress={() => {
                    navigateToEntry(
                      entry.id,
                      entry.type as "journal" | "ai_chat" | "countdown",
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={icon as "chatbubbles-outline"}
                    size={14}
                    color={seasonalTheme.textSecondary}
                  />
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={{
                      color: seasonalTheme.textPrimary,
                      fontSize: 14,
                      marginLeft: spacingPatterns.xs,
                      flex: 1,
                    }}
                  >
                    {preview}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </View>
    </View>
  );

  // Determine if we should show the slot or the empty state
  const showEmptyState = pathname === "/" || pathname === "";

  // Delete confirmation dialog (shared)
  const deleteDialog = (
    <Dialog
      visible={showDeleteConfirm}
      onRequestClose={() => setShowDeleteConfirm(false)}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.sm,
          textAlign: "center",
        }}
      >
        Delete Entry
      </Text>
      <Text
        variant="caption"
        style={{
          color: seasonalTheme.textSecondary,
          marginBottom: spacingPatterns.md,
          textAlign: "center",
        }}
      >
        Are you sure? This action cannot be undone.
      </Text>
      <View style={{ flexDirection: "row", gap: spacingPatterns.sm }}>
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 10,
            borderRadius: borderRadius.md,
            backgroundColor: seasonalTheme.textSecondary + "20",
          }}
          onPress={() => setShowDeleteConfirm(false)}
        >
          <Text style={{ color: seasonalTheme.textPrimary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 10,
            borderRadius: borderRadius.md,
            backgroundColor: "#E53935",
          }}
          onPress={handleDeleteActiveEntry}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Dialog>
  );

  // ===== WIDE SCREEN (Desktop) =====
  if (isWideScreen) {
    return (
      <SafeAreaView
        style={[
          styles.safeAreaContainer,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
        edges={["top", "bottom"]}
        onLayout={(event) => {
          screenWidth.current = event.nativeEvent.layout.width;
        }}
      >
        <View style={styles.sidebarLayout}>
          {/* Sidebar */}
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
            {renderSidebarContent(false)}
          </Animated.View>

          {/* Content panel */}
          <Animated.View
            style={[styles.contentPanel, { left: sidebarAnimWidth }]}
          >
            {renderContentHeader(false)}
            <View style={styles.contentBody}>
              {showEmptyState ? renderEmptyState() : <Slot />}
            </View>
          </Animated.View>
        </View>

        <SearchModal
          visible={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectEntry={handleSearchSelect}
        />

        {deleteDialog}
      </SafeAreaView>
    );
  }

  // ===== NARROW SCREEN (Mobile) =====
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
        {/* Content panel (full width) — swipe from left edge opens drawer */}
        <View
          style={styles.mobileContentPanel}
          {...(drawerOpenPanRef.current?.panHandlers || {})}
        >
          {renderContentHeader(true)}
          <View style={styles.contentBody}>
            {showEmptyState ? renderEmptyState() : <Slot />}
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
            {renderSidebarContent(true)}
          </Animated.View>
        )}
      </View>

      <SearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectEntry={handleSidebarSearchSelect}
      />

      {deleteDialog}
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
    borderRightWidth: 1,
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
    flexShrink: 0,
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
  updateBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    gap: 8,
    flexShrink: 0,
  },
  updateBannerText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    marginLeft: 0,
  },
  updateDot: {
    position: "absolute",
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncErrorBadge: {
    position: "absolute",
    top: -4,
    right: -6,
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
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
  },
  emptyContentPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacingPatterns.xl,
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: spacingPatterns.lg,
    gap: spacingPatterns.xs,
  },
  emptyActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: 20,
  },
  recentSection: {
    marginTop: spacingPatterns.xl * 1.5,
    width: "100%",
    maxWidth: 360,
    minHeight: 204,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
    borderRadius: borderRadius.md,
  },
});
