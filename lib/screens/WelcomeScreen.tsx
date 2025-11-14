import React from "react";
import { View, StyleSheet, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components";
import { spacingPatterns, borderRadius } from "../theme";

interface WelcomeScreenProps {
  onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "bottom"]}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Tagline */}
        <View style={styles.textContainer}>
          <Text
            variant="h1"
            style={styles.title}
          >
            Your personal journal
          </Text>
          <Text
            variant="h1"
            style={styles.title}
          >
            and AI assistant
          </Text>
          
          <View style={styles.featuresContainer}>
            <Text
              variant="h3"
              style={styles.feature}
            >
              offline
            </Text>
            <Text
              variant="h3"
              style={styles.featureDot}
            >
              •
            </Text>
            <Text
              variant="h3"
              style={styles.feature}
            >
              encrypted
            </Text>
            <Text
              variant="h3"
              style={styles.featureDot}
            >
              •
            </Text>
            <Text
              variant="h3"
              style={styles.feature}
            >
              private
            </Text>
          </View>
        </View>

        {/* Spacer to push button to bottom */}
        <View style={styles.spacer} />

        {/* Continue button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={onContinue}
            style={styles.button}
            activeOpacity={0.8}
          >
            <Text variant="body" style={styles.buttonText}>
              Get Started
            </Text>
          </TouchableOpacity>
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
  logoContainer: {
    alignItems: "center",
    marginBottom: spacingPatterns.xl * 3,
  },
  logo: {
    width: 240,
    height: 240,
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
    height: spacingPatterns.xl * 4,
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
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

