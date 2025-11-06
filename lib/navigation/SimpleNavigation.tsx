import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  PanResponder,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius, springPresets } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import {
  HomeScreen,
  type HomeScreenProps,
  SettingsScreen,
  ComponentPlaygroundScreen,
  ComposerScreen,
} from "../screens";
import { isComponentPlaygroundEnabled } from "../utils/isDev";
import { useEntryRepository } from "../db/entries";

type Screen =
  | "home"
  | "settings"
  | "playground"
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
  const entryRepository = useEntryRepository();
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

  const handleOpenSettings = () => {
    setCurrentScreen("settings");
  };

  const handleNavigateToPlayground = () => {
    setCurrentScreen("playground");
  };

  const handleOpenComposer = (type?: "journal" | "ai_chat") => {
    setComposerEntryType(type);
    setCurrentScreen("composer");
  };

  const handleComposerSave = (entryId: number) => {
    // Navigate back to home after saving and refresh
    setHomeRefreshKey((prev) => prev + 1);
    setCurrentScreen("home");
    setComposerEntryType(undefined);
  };

  const handleComposerCancel = () => {
    setCurrentScreen("home");
    setComposerEntryType(undefined);
  };

  const handleOpenFullEditor = async (initialText?: string) => {
    // Create entry immediately with the initial text
    const content = (initialText || "").trim();
    // If content is empty, still create an entry with one empty paragraph block
    const blocks =
      content.length > 0
        ? content
            .split("\n\n")
            .filter((p) => p.trim())
            .map((p) => ({
              type: "paragraph" as const,
              content: p.trim(),
            }))
        : [
            {
              type: "paragraph" as const,
              content: "",
            },
          ];

    try {
      const entry = await entryRepository.create({
        type: "journal",
        title: "untitled note",
        blocks,
        tags: [],
        attachments: [],
        isFavorite: false,
      });

      console.log("Created entry", entry.id, "with", blocks.length, "blocks");
      setFullEditorEntryId(entry.id);
      setCurrentScreen("fullEditor");
      setHomeRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error creating entry:", error);
      // Still navigate even if creation fails - ComposerScreen can handle it
      setCurrentScreen("fullEditor");
    }
  };

  const handleFullEditorSave = (entryId: number) => {
    setHomeRefreshKey((prev) => prev + 1);
    // Don't navigate away - let user continue writing (auto-save handles saving)
  };

  // handleFullEditorCancel is now defined inline in renderScreen

  const handleOpenEntryEditor = (entryId: number) => {
    setEditingEntryId(entryId);
    setCurrentScreen("entryEditor");
  };

  const handleEntryEditorSave = (entryId: number) => {
    setHomeRefreshKey((prev) => prev + 1);
    // Don't navigate away on save for journal entries (they auto-save)
    // Only navigate for AI chat or if explicitly closing
  };

  // handleEntryEditorCancel is now defined inline in renderScreen

  const handleEntryEditorDelete = (entryId: number) => {
    setHomeRefreshKey((prev) => prev + 1);
    setCurrentScreen("home");
    setEditingEntryId(undefined);
  };

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
            onBack={() => setCurrentScreen("home")}
          />
        );
      case "playground":
        return (
          <ComponentPlaygroundScreen
            onBack={() => setCurrentScreen("settings")}
          />
        );
      case "composer":
        return (
          <ComposerScreen
            initialType={composerEntryType}
            onSave={handleComposerSave}
            onCancel={handleComposerCancel}
          />
        );
      case "fullEditor": {
        const cancelHandler = async () => {
          setHomeRefreshKey((prev) => prev + 1);
          setCurrentScreen("home");
          setFullEditorEntryId(undefined);
        };
        fullEditorOnCancelRef.current = cancelHandler;
        return (
          <ComposerScreen
            entryId={fullEditorEntryId}
            onSave={handleFullEditorSave}
            onCancel={cancelHandler}
            fullScreen={true}
          />
        );
      }
      case "entryEditor": {
        const cancelHandler = async () => {
          setHomeRefreshKey((prev) => prev + 1);
          setCurrentScreen("home");
          setEditingEntryId(undefined);
        };
        entryEditorOnCancelRef.current = cancelHandler;
        return (
          <ComposerScreen
            entryId={editingEntryId}
            onSave={handleEntryEditorSave}
            onCancel={cancelHandler}
            onDelete={handleEntryEditorDelete}
          />
        );
      }
      default:
        return (
          <HomeScreen
            refreshKey={homeRefreshKey}
            onOpenFullEditor={handleOpenFullEditor}
            onOpenSettings={handleOpenSettings}
            onOpenEntryEditor={handleOpenEntryEditor}
          />
        );
    }
  };

  const seasonalTheme = useSeasonalTheme();

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
        <Animated.View
          style={[
            styles.content,
            {
              transform: [{ translateX: swipeX }],
            },
          ]}
          {...(panResponderRef.current?.panHandlers || {})}
        >
          {renderScreen()}
        </Animated.View>
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
});
