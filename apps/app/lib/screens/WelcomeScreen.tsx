import React from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { spacingPatterns, borderRadius } from "../theme";

interface WelcomeScreenProps {
  onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const isWide = useIsWideScreen();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={[styles.content, isWide && styles.contentWide]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/icon.png")}
            style={isWide ? styles.logoWide : styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Tagline */}
        <View style={styles.textContainer}>
          <Text variant={isWide ? "h2" : "h1"} style={styles.title}>
            Your personal journal
          </Text>
          <Text variant={isWide ? "h2" : "h1"} style={styles.title}>
            and AI assistant
          </Text>

          <View style={styles.featuresContainer}>
            <Text variant={isWide ? "body" : "h3"} style={styles.feature}>
              offline
            </Text>
            <Text variant={isWide ? "body" : "h3"} style={styles.featureDot}>
              •
            </Text>
            <Text variant={isWide ? "body" : "h3"} style={styles.feature}>
              encrypted
            </Text>
            <Text variant={isWide ? "body" : "h3"} style={styles.featureDot}>
              •
            </Text>
            <Text variant={isWide ? "body" : "h3"} style={styles.feature}>
              private
            </Text>
          </View>
        </View>

        {/* Spacer to push button to bottom on mobile */}
        {!isWide && <View style={styles.spacer} />}
        {isWide && <View style={styles.spacerWide} />}

        {/* Continue button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={onContinue}
            style={[styles.button, isWide && styles.buttonWide]}
            activeOpacity={0.8}
          >
            <Text
              variant="body"
              style={[styles.buttonText, isWide && styles.buttonTextWide]}
            >
              Get Started
            </Text>
          </TouchableOpacity>

          {/* Legal text */}
          <Text variant="caption" style={styles.legalText}>
            By continuing, you accept our{" "}
            <Text
              variant="caption"
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://jot.app/terms")}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              variant="caption"
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://jot.app/privacy")}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    flex: 1,
    paddingHorizontal: spacingPatterns.screen,
    paddingVertical: spacingPatterns.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  contentWide: {
    justifyContent: "center",
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: spacingPatterns.xl * 2,
  },
  logo: {
    width: 160,
    height: 160,
  },
  logoWide: {
    width: 180,
    height: 180,
  },
  textContainer: {
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: spacingPatterns.xs,
    color: "#FFFFFF",
  },
  featuresContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacingPatterns.lg,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  feature: {
    textAlign: "center",
    color: "#FFFFFF",
  },
  featureDot: {
    marginHorizontal: spacingPatterns.sm,
    color: "#FFFFFF",
  },
  spacer: {
    flex: 1,
    minHeight: spacingPatterns.xl * 2,
  },
  spacerWide: {
    height: spacingPatterns.xl * 2,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 400,
  },
  button: {
    width: "100%",
    paddingVertical: spacingPatterns.md,
    paddingHorizontal: spacingPatterns.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonWide: {
    paddingVertical: spacingPatterns.sm,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  buttonTextWide: {
    fontSize: 15,
  },
  legalText: {
    marginTop: spacingPatterns.md,
    textAlign: "center",
    color: "#999999",
    fontSize: 11,
    lineHeight: 16,
  },
  legalLink: {
    color: "#CCCCCC",
    fontSize: 11,
    textDecorationLine: "underline",
  },
});
