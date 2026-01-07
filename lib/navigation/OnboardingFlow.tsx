import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  WelcomeScreen,
  OnboardingModelSelectionScreen,
  TelemetryConsentScreen,
} from "../screens";

interface OnboardingFlowProps {
  onComplete: () => void;
}

type OnboardingStep = "welcome" | "model-selection" | "telemetry-consent";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");

  const handleWelcomeContinue = () => {
    setCurrentStep("model-selection");
  };

  const handleModelSelectionContinue = () => {
    setCurrentStep("telemetry-consent");
  };

  const handleTelemetryConsentContinue = () => {
    onComplete();
  };

  return (
    <View style={styles.container}>
      {currentStep === "welcome" && (
        <WelcomeScreen onContinue={handleWelcomeContinue} />
      )}
      {currentStep === "model-selection" && (
        <OnboardingModelSelectionScreen
          onContinue={handleModelSelectionContinue}
        />
      )}
      {currentStep === "telemetry-consent" && (
        <TelemetryConsentScreen onContinue={handleTelemetryConsentContinue} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
