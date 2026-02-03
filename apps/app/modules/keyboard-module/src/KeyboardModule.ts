import { NativeModule, requireNativeModule } from "expo-modules-core";

declare class KeyboardModuleType extends NativeModule {
  showKeyboard(): boolean;
  hideKeyboard(): boolean;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<KeyboardModuleType>("KeyboardModule");
