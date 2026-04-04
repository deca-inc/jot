import React, { useRef, useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  LayoutChangeEvent,
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
 * A dropdown popover menu that appears anchored to the trigger.
 * Renders above or below depending on available space.
 * Uses a transparent Modal to escape parent overflow:hidden containers.
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

  React.useEffect(() => {
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
  const spaceBelow =
    windowHeight - (triggerLayout.y + triggerLayout.height + gap);
  const placeAbove =
    menuHeight > 0 && spaceBelow < menuHeight && triggerLayout.y > spaceBelow;

  const verticalStyle = placeAbove
    ? { bottom: windowHeight - triggerLayout.y + gap }
    : { top: triggerLayout.y + triggerLayout.height + gap };

  const horizontalStyle =
    anchor === "right"
      ? { right: windowWidth - (triggerLayout.x + triggerLayout.width) }
      : { left: triggerLayout.x };

  return (
    <View ref={triggerRef} collapsable={false}>
      {trigger}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <Pressable style={popoverStyles.dismissOverlay} onPress={onClose}>
          <View
            onLayout={handleMenuLayout}
            style={[
              popoverStyles.menu,
              verticalStyle,
              horizontalStyle,
              {
                backgroundColor: seasonalTheme.gradient.middle,
                borderColor: seasonalTheme.isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.12)",
              },
            ]}
          >
            {children}
          </View>
        </Pressable>
      </Modal>
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
