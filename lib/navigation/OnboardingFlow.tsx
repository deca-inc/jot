import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { WelcomeScreen, OnboardingModelSelectionScreen } from "../screens";

interface OnboardingFlowProps {
  onComplete: () => void;
}

type OnboardingStep = "welcome" | "model-selection";

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");

  const handleWelcomeContinue = () => {
    setCurrentStep("model-selection");
  };

  const handleModelSelectionContinue = () => {
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

