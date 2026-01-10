import { requireNativeModule } from "expo-modules-core";

interface WidgetBridgeModuleType {
  setWidgetData(json: string): Promise<boolean>;
  reloadAllTimelines(): Promise<boolean>;
  updateAllWidgets(): Promise<boolean>;
  getAppGroupContainerPath(): string | null;
}

// Try to load the native module
let nativeModule: WidgetBridgeModuleType | null = null;
try {
  nativeModule = requireNativeModule<WidgetBridgeModuleType>("WidgetBridge");
} catch {
  console.warn("[WidgetBridge] Native module not available");
}

export default nativeModule;
