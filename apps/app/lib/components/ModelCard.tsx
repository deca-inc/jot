import { Ionicons } from "@expo/vector-icons";
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

// Badge configuration for different model types
export interface ModelCardBadge {
  text: string;
  variant: "success" | "accent" | "secondary" | "warning";
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface ModelCardProps {
  /** Model display name */
  displayName: string;
  /** Model description (optional) */
  description?: string | null;
  /** Badge to show (e.g., BUILT-IN, LOCAL, REMOTE) */
  badge?: ModelCardBadge | null;
  /** Whether this model is currently selected */
  isSelected: boolean;
  /** Whether this model is currently downloading */
  isDownloading?: boolean;
  /** Whether this model is currently loading */
  isLoading?: boolean;
  /** Download progress (0-100) */
  downloadProgress?: number;
  /** Formatted size string (e.g., "1.2 GB") */
  sizeText?: string | null;
  /** Warning badge text (shows as inline badge) */
  warningBadge?: string | null;
  /** Warning text (shows as small text below description) */
  warningText?: string | null;
  /** Whether the model can be selected (e.g., is downloaded) */
  canSelect?: boolean;
  /** Whether download action is available */
  canDownload?: boolean;
  /** Whether edit action is available */
  canEdit?: boolean;
  /** Whether remove/delete action is available */
  canRemove?: boolean;
  /** Called when model is selected */
  onSelect?: () => void;
  /** Called when download is requested */
  onDownload?: () => void;
  /** Called when edit is requested */
  onEdit?: () => void;
  /** Called when remove/delete is requested */
  onRemove?: () => void;
}

export function ModelCard({
  displayName,
  description,
  badge,
  isSelected,
  isDownloading = false,
  isLoading = false,
  downloadProgress,
  sizeText,
  warningBadge,
  warningText,
  canSelect = true,
  canDownload = false,
  canEdit = false,
  canRemove = false,
  onSelect,
  onDownload,
  onEdit,
  onRemove,
}: ModelCardProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuButtonRef = useRef<View>(null);

  // Close menu when card state changes
  useEffect(() => {
    if (isDownloading || isLoading) {
      setShowMenu(false);
    }
  }, [isDownloading, isLoading]);

  const getBadgeColor = (variant: ModelCardBadge["variant"]) => {
    switch (variant) {
      case "success":
        return theme.colors.success;
      case "accent":
        return theme.colors.accent;
      case "warning":
        return theme.colors.warning;
      case "secondary":
      default:
        return seasonalTheme.textSecondary;
    }
  };

  const handlePress = () => {
    if (canSelect && onSelect && !isDownloading && !isLoading) {
      onSelect();
    }
  };

  const handleMenuPress = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({
        top: y + height + 4,
        right: 20,
      });
      setShowMenu(true);
    });
  };

  const handleEdit = () => {
    setShowMenu(false);
    onEdit?.();
  };

  const handleRemove = () => {
    setShowMenu(false);
    onRemove?.();
  };

  const hasMenuItems = (canEdit && onEdit) || (canRemove && onRemove);

  const renderActions = () => {
    const actions: React.ReactNode[] = [];

    // Download button
    if (canDownload && onDownload && !isDownloading) {
      actions.push(
        <TouchableOpacity
          key="download"
          onPress={onDownload}
          style={[
            styles.actionButton,
            { backgroundColor: theme.colors.accent },
          ]}
        >
          <Ionicons name="cloud-download-outline" size={14} color="white" />
        </TouchableOpacity>,
      );
    }

    // Loading indicator when downloading or loading
    if (isDownloading || isLoading) {
      actions.push(
        <View key="loading" style={styles.actionButtonContainer}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
        </View>,
      );
    }

    // Overflow menu button (for edit/delete)
    if (hasMenuItems && !isDownloading && !isLoading) {
      actions.push(
        <View key="menu" ref={menuButtonRef} collapsable={false}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleMenuPress();
            }}
            style={styles.iconButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>
        </View>,
      );
    }

    return actions;
  };

  return (
    <>
      <View
        style={[
          styles.card,
          {
            backgroundColor: seasonalTheme.cardBg,
            borderColor: isSelected
              ? theme.colors.accent
              : `${theme.colors.border}40`,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={handlePress}
          disabled={isDownloading || isLoading || !canSelect}
          activeOpacity={0.7}
          delayPressIn={50}
        >
          <View style={styles.cardContent}>
            {/* Model Info */}
            <View style={styles.modelInfo}>
              <View style={styles.headerRow}>
                <Text
                  variant="body"
                  style={[
                    styles.modelName,
                    { color: seasonalTheme.textPrimary, fontWeight: "600" },
                  ]}
                >
                  {displayName}
                </Text>
                {badge && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: `${getBadgeColor(badge.variant)}20` },
                    ]}
                  >
                    {badge.icon && (
                      <Ionicons
                        name={badge.icon}
                        size={10}
                        color={getBadgeColor(badge.variant)}
                        style={styles.badgeIcon}
                      />
                    )}
                    <Text
                      variant="caption"
                      style={[
                        styles.badgeText,
                        { color: getBadgeColor(badge.variant) },
                      ]}
                    >
                      {badge.text}
                    </Text>
                  </View>
                )}
              </View>
              {description && (
                <Text
                  variant="caption"
                  style={[
                    styles.modelDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  {description}
                </Text>
              )}
              {warningBadge && (
                <View
                  style={[
                    styles.warningBadgeContainer,
                    { backgroundColor: `${theme.colors.warning}20` },
                  ]}
                >
                  <Ionicons
                    name="warning"
                    size={10}
                    color={theme.colors.warning}
                  />
                  <Text
                    style={[
                      styles.warningBadgeText,
                      { color: theme.colors.warning },
                    ]}
                  >
                    {warningBadge}
                  </Text>
                </View>
              )}
              {warningText && (
                <Text
                  variant="caption"
                  style={[
                    styles.warningTextStyle,
                    { color: theme.colors.warning },
                  ]}
                >
                  {warningText}
                </Text>
              )}
              {/* Progress bar when downloading */}
              {isDownloading && downloadProgress !== undefined && (
                <View style={styles.progressContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { backgroundColor: `${theme.colors.border}30` },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: theme.colors.accent,
                          width: `${downloadProgress}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    variant="caption"
                    style={[
                      styles.progressText,
                      { color: seasonalTheme.textSecondary },
                    ]}
                  >
                    {downloadProgress}%
                  </Text>
                </View>
              )}
            </View>

            {/* Right section: Size + Actions */}
            <View style={styles.rightSection}>
              {sizeText && (
                <Text
                  variant="caption"
                  style={[
                    styles.sizeText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  {sizeText}
                </Text>
              )}
              <View style={styles.actionsRow}>{renderActions()}</View>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Overflow Menu */}
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
                backgroundColor: seasonalTheme.isDark ? "#2a2a2a" : "#ffffff",
                top: menuPosition.top,
                right: menuPosition.right,
              },
            ]}
          >
            {canEdit && onEdit && (
              <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
                <Ionicons
                  name="pencil-outline"
                  size={16}
                  color={seasonalTheme.textPrimary}
                />
                <Text
                  variant="body"
                  style={[
                    styles.menuItemText,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Edit
                </Text>
              </TouchableOpacity>
            )}
            {canRemove && onRemove && (
              <TouchableOpacity style={styles.menuItem} onPress={handleRemove}>
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={theme.colors.error}
                />
                <Text
                  variant="body"
                  style={[styles.menuItemText, { color: theme.colors.error }]}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTouchable: {
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  modelName: {
    fontSize: 14,
    lineHeight: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeIcon: {
    marginRight: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  modelDescription: {
    fontSize: 11,
    lineHeight: 13,
  },
  warningBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warningBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  warningTextStyle: {
    fontSize: 10,
    marginTop: 4,
  },
  progressContainer: {
    marginTop: spacingPatterns.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontWeight: "600",
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  sizeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    padding: 4,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  menuContainer: {
    position: "absolute",
    minWidth: 120,
    borderRadius: borderRadius.md,
    paddingVertical: spacingPatterns.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
  },
  menuItemText: {
    fontSize: 14,
  },
});
