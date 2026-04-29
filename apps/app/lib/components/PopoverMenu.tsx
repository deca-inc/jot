import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  LayoutChangeEvent,
  Platform,
} from "react-native";
import { borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export interface PopoverMenuProps {
  /** The trigger element (e.g., an icon button) */
  trigger: React.ReactNode;
  /** Whether the menu is visible */
  visible: boolean;
  /** Called when the menu should close */
  onClose: () => void;
  /** Menu items to render */
  children: React.ReactNode;
  /** Anchor the menu to the right edge (default) or left */
  anchor?: "right" | "left";
}

interface TriggerLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Web-only portal overlay that replaces Modal to avoid full-viewport repaint
 * flicker in Tauri / desktop webviews.
 */
function WebPortalOverlay({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );

  useEffect(() => {
    if (!visible) {
      // Clean up when closing
      if (portalContainer) {
        portalContainer.remove();
        setPortalContainer(null);
      }
      return;
    }

    const el = document.createElement("div");
    // fixed overlay that captures clicks to dismiss
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "9999",
    });
    document.body.appendChild(el);
    setPortalContainer(el);

    return () => {
      el.remove();
    };
  }, [visible]);

  if (!visible || !portalContainer) return null;

  const { createPortal } = require("react-dom") as typeof import("react-dom");

  return createPortal(
    <Pressable
      style={popoverStyles.dismissOverlay}
      onPress={onClose}
      tabIndex={-1}
      aria-hidden
    >
      {children}
    </Pressable>,
    portalContainer,
  );
}

/**
 * A dropdown popover menu that appears anchored to the trigger.
 * Renders above or below depending on available space.
 * On native uses Modal; on web uses a lightweight portal to avoid flicker.
 */
export function PopoverMenu({
  trigger,
  visible,
  onClose,
  children,
  anchor = "right",
}: PopoverMenuProps) {
  const seasonalTheme = useSeasonalTheme();
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<TriggerLayout>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [menuHeight, setMenuHeight] = useState(0);

  const measure = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height });
    });
  }, []);

  useEffect(() => {
    if (visible) {
      measure();
    }
  }, [visible, measure]);

  const handleMenuLayout = useCallback((e: LayoutChangeEvent) => {
    setMenuHeight(e.nativeEvent.layout.height);
  }, []);

  // Decide above vs below
  const windowHeight = Dimensions.get("window").height;
  const windowWidth = Dimensions.get("window").width;
  const gap = 4;
  const hasLayout = triggerLayout.width > 0 && triggerLayout.height > 0;
  const spaceBelow =
    windowHeight - (triggerLayout.y + triggerLayout.height + gap);
  // Only place above if there's not enough room below AND enough room above
  const placeAbove =
    hasLayout &&
    menuHeight > 0 &&
    spaceBelow < menuHeight &&
    triggerLayout.y > menuHeight;

  const verticalStyle = placeAbove
    ? { bottom: windowHeight - triggerLayout.y + gap }
    : { top: triggerLayout.y + triggerLayout.height + gap };

  const horizontalStyle =
    anchor === "right"
      ? { right: windowWidth - (triggerLayout.x + triggerLayout.width) }
      : { left: triggerLayout.x };

  // Hide menu until trigger is measured to prevent flash at wrong position
  const menuOpacity = hasLayout ? 1 : 0;

  const menuContent = (
    <View
      onLayout={handleMenuLayout}
      style={[
        popoverStyles.menu,
        verticalStyle,
        horizontalStyle,
        {
          opacity: menuOpacity,
          backgroundColor: seasonalTheme.gradient.middle,
          borderColor: seasonalTheme.isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.12)",
        },
      ]}
    >
      {children}
    </View>
  );

  return (
    <View ref={triggerRef} collapsable={false}>
      {trigger}
      {Platform.OS === "web" ? (
        <WebPortalOverlay visible={visible} onClose={onClose}>
          {menuContent}
        </WebPortalOverlay>
      ) : (
        <Modal
          visible={visible}
          transparent
          animationType="none"
          onRequestClose={onClose}
        >
          <Pressable style={popoverStyles.dismissOverlay} onPress={onClose}>
            {menuContent}
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const popoverStyles = StyleSheet.create({
  dismissOverlay: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 160,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
});
