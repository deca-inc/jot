/**
 * Sync Setup Modal
 *
 * Multi-step modal for configuring sync server connection.
 * Steps: Server URL → Login/Register
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSyncAuth } from "../sync/useSyncAuth";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { FormField } from "./FormField";
import { FormModal } from "./FormModal";
import { Input } from "./Input";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

export interface SyncSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onSetupComplete?: () => void;
}

type Step = "server" | "auth";
type AuthMode = "login" | "register";

export function SyncSetupModal({
  visible,
  onClose,
  onSetupComplete,
}: SyncSetupModalProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { showToast } = useToast();
  const { checkServerConnection, register, login } = useSyncAuth();

  // Form state
  const [step, setStep] = useState<Step>("server");
  const [serverUrl, setServerUrl] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [serverChecked, setServerChecked] = useState(false);

  // Reset form when modal closes
  const handleClose = useCallback(() => {
    setStep("server");
    setServerUrl("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setIsLoading(false);
    setServerChecked(false);
    onClose();
  }, [onClose]);

  // Normalize server URL
  const normalizeUrl = useCallback((url: string): string => {
    let normalized = url.trim();
    // Add https:// if no protocol
    if (
      !normalized.startsWith("http://") &&
      !normalized.startsWith("https://")
    ) {
      normalized = "https://" + normalized;
    }
    // Remove trailing slash
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }, []);

  // Handle server URL submission
  const handleServerSubmit = useCallback(async () => {
    if (!serverUrl.trim()) {
      showToast("Please enter a server URL", "error");
      return;
    }

    setIsLoading(true);
    const normalizedUrl = normalizeUrl(serverUrl);

    try {
      const isReachable = await checkServerConnection(normalizedUrl);

      if (isReachable) {
        setServerUrl(normalizedUrl);
        setServerChecked(true);
        setStep("auth");
      } else {
        showToast("Server is not reachable", "error");
      }
    } catch (error) {
      const err = error as { message?: string };
      showToast(err.message || "Failed to connect to server", "error");
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, normalizeUrl, checkServerConnection, showToast]);

  // Handle auth submission
  const handleAuthSubmit = useCallback(async () => {
    if (!email.trim()) {
      showToast("Please enter your email", "error");
      return;
    }
    if (!password) {
      showToast("Please enter your password", "error");
      return;
    }
    if (authMode === "register") {
      if (password.length < 8) {
        showToast("Password must be at least 8 characters", "error");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Passwords do not match", "error");
        return;
      }
    }

    setIsLoading(true);

    try {
      if (authMode === "register") {
        await register(serverUrl, email.trim(), password);
        showToast("Account created successfully", "success");
      } else {
        await login(serverUrl, email.trim(), password);
        showToast("Logged in successfully", "success");
      }

      onSetupComplete?.();
      handleClose();
    } catch (error) {
      const err = error as { message?: string };
      showToast(
        err.message ||
          `${authMode === "register" ? "Registration" : "Login"} failed`,
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    email,
    password,
    confirmPassword,
    authMode,
    serverUrl,
    register,
    login,
    showToast,
    onSetupComplete,
    handleClose,
  ]);

  // Get step title
  const stepTitle = useMemo(() => {
    if (step === "server") {
      return "Configure Sync Server";
    }
    return authMode === "register" ? "Create Account" : "Sign In";
  }, [step, authMode]);

  // Can go back?
  const canGoBack = step === "auth";

  const handleBack = useCallback(() => {
    if (step === "auth") {
      setStep("server");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    }
  }, [step]);

  // Footer for server step
  const serverFooter =
    step === "server" ? (
      <TouchableOpacity
        style={[
          styles.continueButton,
          { backgroundColor: theme.colors.accent },
          isLoading && styles.buttonDisabled,
        ]}
        onPress={handleServerSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Text variant="body" style={{ color: "white", fontWeight: "600" }}>
              Connect
            </Text>
            <Ionicons name="arrow-forward" size={18} color="white" />
          </>
        )}
      </TouchableOpacity>
    ) : undefined;

  // Footer for auth step
  const authFooter =
    step === "auth" ? (
      <View style={styles.authFooter}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: theme.colors.accent },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleAuthSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text variant="body" style={{ color: "white", fontWeight: "600" }}>
              {authMode === "register" ? "Create Account" : "Sign In"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchModeButton}
          onPress={() => {
            setAuthMode(authMode === "login" ? "register" : "login");
            setConfirmPassword("");
          }}
          disabled={isLoading}
        >
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary }}
          >
            {authMode === "login"
              ? "Don't have an account? Create one"
              : "Already have an account? Sign in"}
          </Text>
        </TouchableOpacity>
      </View>
    ) : undefined;

  return (
    <FormModal
      visible={visible}
      onClose={handleClose}
      title={stepTitle}
      onBack={canGoBack ? handleBack : undefined}
      maxHeightRatio={0.8}
      footer={serverFooter || authFooter}
    >
      {/* Server URL Step */}
      {step === "server" && (
        <View style={styles.stepContent}>
          <Text
            variant="body"
            style={[styles.description, { color: seasonalTheme.textSecondary }]}
          >
            Enter the URL of your sync server. This is where your journal
            entries will be synced.
          </Text>

          <FormField label="Server URL">
            <Input
              placeholder="https://sync.example.com"
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </FormField>

          {serverChecked && (
            <View style={styles.statusBadge}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={theme.colors.accent}
              />
              <Text
                variant="caption"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Server is reachable
              </Text>
            </View>
          )}

          <View style={styles.infoNote}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={seasonalTheme.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: seasonalTheme.textSecondary,
                flex: 1,
                fontSize: 11,
              }}
            >
              You can run your own sync server or use a hosted service. Your
              data is encrypted before leaving your device.
            </Text>
          </View>
        </View>
      )}

      {/* Auth Step */}
      {step === "auth" && (
        <View style={styles.stepContent}>
          <View style={styles.serverInfo}>
            <Text
              variant="caption"
              style={{ color: seasonalTheme.textSecondary }}
            >
              Connecting to:
            </Text>
            <Text
              variant="body"
              style={{ color: seasonalTheme.textPrimary, fontWeight: "500" }}
            >
              {serverUrl}
            </Text>
          </View>

          <FormField label="Email">
            <Input
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </FormField>

          <FormField label="Password">
            <Input
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </FormField>

          {authMode === "register" && (
            <FormField label="Confirm Password">
              <Input
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </FormField>
          )}

          {authMode === "register" && (
            <View style={styles.infoNote}>
              <Ionicons
                name="shield-checkmark-outline"
                size={14}
                color={seasonalTheme.textSecondary}
              />
              <Text
                variant="caption"
                style={{
                  color: seasonalTheme.textSecondary,
                  flex: 1,
                  fontSize: 11,
                }}
              >
                Your password is used to encrypt your data. Choose a strong,
                memorable password.
              </Text>
            </View>
          )}
        </View>
      )}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  stepContent: {
    gap: spacingPatterns.sm,
  },
  description: {
    marginBottom: spacingPatterns.sm,
    lineHeight: 20,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginTop: -spacingPatterns.xs,
  },
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: borderRadius.sm,
  },
  serverInfo: {
    padding: spacingPatterns.sm,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: borderRadius.sm,
    marginBottom: spacingPatterns.sm,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  authFooter: {
    gap: spacingPatterns.sm,
  },
  switchModeButton: {
    alignItems: "center",
    padding: spacingPatterns.xs,
  },
});
