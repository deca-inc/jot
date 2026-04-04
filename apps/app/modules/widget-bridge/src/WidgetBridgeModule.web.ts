/**
 * Web shim for WidgetBridgeModule
 *
 * iOS/Android widgets are not available on web.
 * All methods return safe no-op/default values.
 */

interface WidgetBridgeModuleType {
  setWidgetData(json: string): Promise<boolean>;
  reloadAllTimelines(): Promise<boolean>;
  updateAllWidgets(): Promise<boolean>;
  getAppGroupContainerPath(): string | null;
}

/** Native module is not available on web */
const nativeModule: WidgetBridgeModuleType | null = null;

export default nativeModule;
