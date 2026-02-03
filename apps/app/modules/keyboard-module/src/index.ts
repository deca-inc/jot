import { Platform } from "react-native";

// Type for the native keyboard module
interface NativeKeyboardModule {
  showKeyboard(): boolean;
  hideKeyboard(): boolean;
}

// Lazy load the native module only on Android to avoid errors on iOS
let KeyboardModule: NativeKeyboardModule | null = null;
function getKeyboardModule(): NativeKeyboardModule | null {
  if (KeyboardModule === null && Platform.OS === "android") {
    KeyboardModule = require("./KeyboardModule").default;
  }
  return KeyboardModule;
}

/**
 * Show the software keyboard on Android.
 * This is a no-op on iOS since iOS handles keyboard display automatically.
 */
export function showKeyboard(): boolean {
  if (Platform.OS === "android") {
    const module = getKeyboardModule();
    return module?.showKeyboard() ?? false;
  }
  return false;
}

/**
 * Hide the software keyboard on Android.
 * This is a no-op on iOS.
 */
export function hideKeyboard(): boolean {
  if (Platform.OS === "android") {
    const module = getKeyboardModule();
    return module?.hideKeyboard() ?? false;
  }
  return false;
}
