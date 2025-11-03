import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Text,
  Button,
  Card,
  EntryListItem,
  BottomComposer,
  ThemeControl,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, springPresets, borderRadius } from "../theme";
import { useEntryRepository } from "../db/entries";

type ComponentPage =
  | "typography"
  | "buttons"
  | "cards"
  | "entryListItem"
  | "bottomComposer"
  | "animations"
  | "spacing"
  | "colors";

const COMPONENT_PAGES: { id: ComponentPage; label: string }[] = [
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "cards", label: "Cards" },
  { id: "entryListItem", label: "Entry List Item" },
  { id: "bottomComposer", label: "Bottom Composer" },
  { id: "animations", label: "Animations" },
  { id: "spacing", label: "Spacing" },
  { id: "colors", label: "Colors" },
];

interface ComponentPlaygroundScreenProps {
  onBack?: () => void;
}

export function ComponentPlaygroundScreen({
  onBack,
}: ComponentPlaygroundScreenProps = {}) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const [selectedPage, setSelectedPage] = useState<ComponentPage>("typography");
  const [showPicker, setShowPicker] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);

  const renderPage = () => {
    switch (selectedPage) {
      case "typography":
        return <TypographyPage seasonalTheme={seasonalTheme} />;
      case "buttons":
        return (
          <ButtonsPage
            seasonalTheme={seasonalTheme}
            buttonLoading={buttonLoading}
            setButtonLoading={setButtonLoading}
          />
        );
      case "cards":
        return <CardsPage seasonalTheme={seasonalTheme} />;
      case "entryListItem":
        return <EntryListItemPage seasonalTheme={seasonalTheme} />;
      case "bottomComposer":
        return <BottomComposerPage seasonalTheme={seasonalTheme} />;
      case "animations":
        return <AnimationsPage seasonalTheme={seasonalTheme} />;
      case "spacing":
        return <SpacingPage seasonalTheme={seasonalTheme} />;
      case "colors":
        return <ColorsPage seasonalTheme={seasonalTheme} />;
      default:
        return <TypographyPage seasonalTheme={seasonalTheme} />;
    }
  };

  return (
    <View
      style={[
        styles.gradient,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text
                variant="label"
                style={[
                  styles.backButtonText,
                  { color: seasonalTheme.textPrimary },
                ]}
              >
                ← Back
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowPicker(true)}
            style={[
              styles.pickerButton,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: seasonalTheme.textSecondary + "30",
                flex: 1,
              },
            ]}
          >
            <Text variant="label" style={{ color: seasonalTheme.textPrimary }}>
              {COMPONENT_PAGES.find((p) => p.id === selectedPage)?.label ||
                "Select Component"}
            </Text>
            <Text style={{ color: seasonalTheme.textSecondary }}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.themeOverride}>
          <Text
            variant="caption"
            style={{
              color: seasonalTheme.textSecondary,
              marginBottom: spacingPatterns.xs,
            }}
          >
            Theme Override:
          </Text>
          <ThemeControl />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacingPatterns.screen },
        ]}
      >
        {renderPage()}
      </ScrollView>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View
            style={[
              styles.pickerModal,
              {
                backgroundColor: seasonalTheme.gradient.middle,
                shadowColor: seasonalTheme.subtleGlow.shadowColor,
                shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
              },
            ]}
          >
            {COMPONENT_PAGES.map((page) => (
              <TouchableOpacity
                key={page.id}
                onPress={() => {
                  setSelectedPage(page.id);
                  setShowPicker(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedPage === page.id && {
                    backgroundColor: seasonalTheme.chipBg,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{
                    color:
                      selectedPage === page.id
                        ? seasonalTheme.chipText
                        : seasonalTheme.textPrimary,
                    fontWeight: selectedPage === page.id ? "600" : "400",
                  }}
                >
                  {page.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Individual component pages
function TypographyPage({ seasonalTheme }: { seasonalTheme: any }) {
  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Typography
      </Text>
      <View style={styles.componentGrid}>
        <Text variant="h1" style={{ color: seasonalTheme.textPrimary }}>
          Heading 1
        </Text>
        <Text variant="h2" style={{ color: seasonalTheme.textPrimary }}>
          Heading 2
        </Text>
        <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
          Heading 3
        </Text>
        <Text variant="h4" style={{ color: seasonalTheme.textPrimary }}>
          Heading 4
        </Text>
        <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
          Body text - The quick brown fox jumps over the lazy dog
        </Text>
        <Text variant="bodyLarge" style={{ color: seasonalTheme.textPrimary }}>
          Body Large - The quick brown fox jumps over the lazy dog
        </Text>
        <Text variant="bodySmall" style={{ color: seasonalTheme.textPrimary }}>
          Body Small - The quick brown fox jumps over the lazy dog
        </Text>
        <Text variant="label" style={{ color: seasonalTheme.textPrimary }}>
          Label Text
        </Text>
        <Text variant="caption" style={{ color: seasonalTheme.textSecondary }}>
          Caption text
        </Text>
      </View>
    </Card>
  );
}

function ButtonsPage({
  seasonalTheme,
  buttonLoading,
  setButtonLoading,
}: {
  seasonalTheme: any;
  buttonLoading: boolean;
  setButtonLoading: (loading: boolean) => void;
}) {
  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Buttons
      </Text>
      <View style={styles.componentGrid}>
        <Button variant="primary">Primary Button</Button>
        <Button variant="secondary">Secondary Button</Button>
        <Button variant="ghost">Ghost Button</Button>
        <Button variant="primary" size="sm">
          Small
        </Button>
        <Button variant="primary" size="md">
          Medium
        </Button>
        <Button variant="primary" size="lg">
          Large
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button
          variant="primary"
          loading={buttonLoading}
          onPress={() => {
            setButtonLoading(true);
            setTimeout(() => setButtonLoading(false), 2000);
          }}
        >
          Loading State
        </Button>
      </View>
    </Card>
  );
}

function CardsPage({ seasonalTheme }: { seasonalTheme: any }) {
  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Cards
      </Text>
      <View style={styles.componentGrid}>
        <Card
          variant="default"
          padding="md"
          style={{ backgroundColor: seasonalTheme.cardBg }}
        >
          <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
            Default Card
          </Text>
        </Card>
        <Card
          variant="elevated"
          padding="md"
          style={{ backgroundColor: seasonalTheme.cardBg }}
        >
          <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
            Elevated Card
          </Text>
        </Card>
        <Card
          variant="borderless"
          padding="md"
          style={{ backgroundColor: seasonalTheme.cardBg }}
        >
          <Text variant="body" style={{ color: seasonalTheme.textPrimary }}>
            Borderless Card
          </Text>
        </Card>
      </View>
    </Card>
  );
}

function EntryListItemPage({ seasonalTheme }: { seasonalTheme: any }) {
  const entryRepository = useEntryRepository();
  const [sampleEntry, setSampleEntry] = useState<any>(null);

  useEffect(() => {
    const loadSample = async () => {
      try {
        const entries = await entryRepository.getAll({ limit: 1 });
        if (entries.length > 0) {
          setSampleEntry(entries[0]);
        } else {
          // Create a sample entry
          const entry = await entryRepository.create({
            type: "journal",
            title: "Sample Entry for Playground",
            blocks: [
              {
                type: "paragraph",
                content:
                  "This is a sample journal entry for testing the EntryListItem component.",
              },
            ],
            tags: ["sample", "test"],
            attachments: [],
            isFavorite: false,
          });
          setSampleEntry(entry);
        }
      } catch (error) {
        console.error("Error loading sample entry:", error);
      }
    };
    loadSample();
  }, []);

  if (!sampleEntry) {
    return (
      <Card
        variant="borderless"
        style={[
          styles.pageCard,
          {
            backgroundColor: seasonalTheme.cardBg,
            shadowColor: seasonalTheme.subtleGlow.shadowColor,
            shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
          },
        ]}
      >
        <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
          Loading sample entry...
        </Text>
      </Card>
    );
  }

  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Entry List Item
      </Text>
      <EntryListItem entry={sampleEntry} seasonalTheme={seasonalTheme} />
    </Card>
  );
}

function BottomComposerPage({ seasonalTheme }: { seasonalTheme: any }) {
  const [mode, setMode] = useState<"journal" | "ai">("journal");

  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Bottom Composer
      </Text>
      <BottomComposer
        mode={mode}
        onModeChange={setMode}
        onSubmit={(text) => console.log("Submitted:", text)}
      />
    </Card>
  );
}

function AnimationsPage({ seasonalTheme }: { seasonalTheme: any }) {
  const scaleDemo = useRef(new Animated.Value(1)).current;
  const fadeDemo = useRef(new Animated.Value(1)).current;
  const slideDemo = useRef(new Animated.Value(0)).current;

  const triggerScaleDemo = () => {
    Animated.sequence([
      Animated.spring(scaleDemo, {
        toValue: 1.1,
        ...springPresets.feedback,
      }),
      Animated.spring(scaleDemo, {
        toValue: 1,
        ...springPresets.feedback,
      }),
    ]).start();
  };

  const triggerFadeDemo = () => {
    Animated.sequence([
      Animated.spring(fadeDemo, {
        toValue: 0.3,
        ...springPresets.gentle,
      }),
      Animated.spring(fadeDemo, {
        toValue: 1,
        ...springPresets.gentle,
      }),
    ]).start();
  };

  const triggerSlideDemo = () => {
    Animated.sequence([
      Animated.spring(slideDemo, {
        toValue: 20,
        ...springPresets.modal,
      }),
      Animated.spring(slideDemo, {
        toValue: 0,
        ...springPresets.modal,
      }),
    ]).start();
  };

  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Spring Animations
      </Text>
      <Text
        variant="body"
        style={{
          color: seasonalTheme.textSecondary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Subtle spring-based animations for premium feel. Tap to see them in
        action!
      </Text>
      <View style={styles.componentGrid}>
        <View>
          <Text
            variant="label"
            style={{
              marginBottom: spacingPatterns.xs,
              color: seasonalTheme.textPrimary,
            }}
          >
            Scale Animation
          </Text>
          <TouchableOpacity onPress={triggerScaleDemo} activeOpacity={0.7}>
            <Animated.View
              style={[
                {
                  width: 100,
                  height: 100,
                  backgroundColor: seasonalTheme.textPrimary,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                },
                {
                  transform: [{ scale: scaleDemo }],
                },
              ]}
            >
              <Text
                style={{ color: seasonalTheme.gradient.middle }}
                variant="label"
              >
                Tap me!
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View>
          <Text
            variant="label"
            style={{
              marginBottom: spacingPatterns.xs,
              color: seasonalTheme.textPrimary,
            }}
          >
            Fade Animation
          </Text>
          <TouchableOpacity onPress={triggerFadeDemo} activeOpacity={0.7}>
            <Animated.View
              style={[
                {
                  width: 100,
                  height: 100,
                  backgroundColor: seasonalTheme.textPrimary,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: fadeDemo,
                },
              ]}
            >
              <Text
                style={{ color: seasonalTheme.gradient.middle }}
                variant="label"
              >
                Tap me!
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View>
          <Text
            variant="label"
            style={{
              marginBottom: spacingPatterns.xs,
              color: seasonalTheme.textPrimary,
            }}
          >
            Slide Animation
          </Text>
          <TouchableOpacity onPress={triggerSlideDemo} activeOpacity={0.7}>
            <Animated.View
              style={[
                {
                  width: 100,
                  height: 100,
                  backgroundColor: seasonalTheme.textPrimary,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ translateX: slideDemo }],
                },
              ]}
            >
              <Text
                style={{ color: seasonalTheme.gradient.middle }}
                variant="label"
              >
                Tap me!
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );
}

function SpacingPage({ seasonalTheme }: { seasonalTheme: any }) {
  const theme = useTheme();
  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Spacing
      </Text>
      <View style={styles.componentGrid}>
        <View
          style={{
            marginBottom: spacingPatterns.xs,
            backgroundColor: seasonalTheme.chipBg,
            padding: spacingPatterns.xs,
            borderRadius: borderRadius.sm,
          }}
        >
          <Text variant="caption" style={{ color: seasonalTheme.textPrimary }}>
            xs: {spacingPatterns.xs}px
          </Text>
        </View>
        <View
          style={{
            marginBottom: spacingPatterns.sm,
            backgroundColor: seasonalTheme.chipBg,
            padding: spacingPatterns.sm,
            borderRadius: borderRadius.sm,
          }}
        >
          <Text variant="caption" style={{ color: seasonalTheme.textPrimary }}>
            sm: {spacingPatterns.sm}px
          </Text>
        </View>
        <View
          style={{
            marginBottom: spacingPatterns.md,
            backgroundColor: seasonalTheme.chipBg,
            padding: spacingPatterns.md,
            borderRadius: borderRadius.sm,
          }}
        >
          <Text variant="caption" style={{ color: seasonalTheme.textPrimary }}>
            md: {spacingPatterns.md}px
          </Text>
        </View>
        <View
          style={{
            marginBottom: spacingPatterns.lg,
            backgroundColor: seasonalTheme.chipBg,
            padding: spacingPatterns.lg,
            borderRadius: borderRadius.sm,
          }}
        >
          <Text variant="caption" style={{ color: seasonalTheme.textPrimary }}>
            lg: {spacingPatterns.lg}px
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ColorsPage({ seasonalTheme }: { seasonalTheme: any }) {
  return (
    <Card
      variant="borderless"
      style={[
        styles.pageCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          shadowColor: seasonalTheme.subtleGlow.shadowColor,
          shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
        },
      ]}
    >
      <Text
        variant="h3"
        style={{
          color: seasonalTheme.textPrimary,
          marginBottom: spacingPatterns.md,
        }}
      >
        Seasonal Theme Colors
      </Text>
      <View style={styles.componentGrid}>
        <View
          style={{
            padding: spacingPatterns.md,
            backgroundColor: seasonalTheme.cardBg,
            borderRadius: borderRadius.md,
            borderWidth: 1,
            borderColor: seasonalTheme.textSecondary + "20",
          }}
        >
          <Text
            variant="label"
            style={{
              color: seasonalTheme.textPrimary,
              marginBottom: spacingPatterns.xs,
            }}
          >
            Card Background
          </Text>
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary }}
          >
            {seasonalTheme.cardBg}
          </Text>
        </View>
        <View
          style={{
            padding: spacingPatterns.md,
            backgroundColor: seasonalTheme.chipBg,
            borderRadius: borderRadius.md,
            borderWidth: 1,
            borderColor: seasonalTheme.textSecondary + "20",
          }}
        >
          <Text
            variant="label"
            style={{
              color: seasonalTheme.chipText,
              marginBottom: spacingPatterns.xs,
            }}
          >
            Chip Background
          </Text>
          <Text variant="caption" style={{ color: seasonalTheme.chipText }}>
            {seasonalTheme.chipBg}
          </Text>
        </View>
        <View
          style={{
            padding: spacingPatterns.md,
            backgroundColor: seasonalTheme.gradient.middle,
            borderRadius: borderRadius.md,
          }}
        >
          <Text
            variant="label"
            style={{
              color: seasonalTheme.textPrimary,
              marginBottom: spacingPatterns.xs,
            }}
          >
            Gradient Middle
          </Text>
          <Text variant="caption" style={{ color: seasonalTheme.textPrimary }}>
            {seasonalTheme.gradient.middle}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  header: {
    padding: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
    gap: spacingPatterns.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  backButton: {
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
  },
  backButtonText: {
    fontSize: 16,
  },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  themeOverride: {
    gap: spacingPatterns.xs,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacingPatterns.screen,
    paddingTop: 0,
  },
  pageCard: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.xl,
    shadowOffset: { width: 0, height: 30 },
    shadowRadius: 60,
    elevation: 8,
  },
  componentGrid: {
    gap: spacingPatterns.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerModal: {
    borderRadius: borderRadius.xl,
    padding: spacingPatterns.md,
    minWidth: 250,
    maxWidth: 400,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 40,
    elevation: 8,
    overflow: "hidden",
  },
  pickerItem: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    marginBottom: spacingPatterns.xs,
  },
});
