// Metro configuration for Expo with ExecuTorch model assets and expo-router
// Note: Large model files (.pte) are loaded at runtime from filesystem, not bundled by Metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('metro-config').ConfigT} */
const config = getDefaultConfig(projectRoot);

// Add monorepo root to watch folders (preserve defaults)
config.watchFolders = [...(config.watchFolders || []), monorepoRoot];

// Ensure ExecuTorch assets are recognized by Metro (for tokenizer files)
config.resolver.assetExts.push("pte");
config.resolver.assetExts.push("bin");

// Block all large .pte model files from being processed by Metro
// This avoids memory issues during development
// Models are downloaded via in-app UI or pnpm download:models script
config.resolver.blockList = [
  new RegExp(path.resolve(projectRoot, "assets/models/.*\\.pte$")),
];

// Redirect native module imports to web shims when bundling for web
const platformDir = path.resolve(projectRoot, "lib/platform");
const emptyShim = path.resolve(platformDir, "empty.web.ts");

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    // Web shims that redirect to platform-specific implementations
    const webShims = {
      "react-native-quick-crypto": path.resolve(
        platformDir,
        "cryptoPolyfill.web.ts",
      ),
      "react-native-argon2": path.resolve(platformDir, "argon2.web.ts"),
      "react-native-mmkv": path.resolve(platformDir, "mmkv.web.ts"),
      "expo-secure-store": path.resolve(platformDir, "secureStore.web.ts"),
      "react-native-executorch": path.resolve(platformDir, "executorch.web.ts"),
      "expo-blur": path.resolve(platformDir, "blur.web.tsx"),
      "expo-file-system": path.resolve(platformDir, "fileSystem.web.ts"),
      "expo-file-system/legacy": path.resolve(platformDir, "fileSystem.web.ts"),
      "@react-native-async-storage/async-storage": path.resolve(
        platformDir,
        "asyncStorage.web.ts",
      ),
      "expo-sqlite": path.resolve(platformDir, "expoSqlite.web.ts"),
      "@dr.pogodin/react-native-fs": path.resolve(
        platformDir,
        "reactNativeFs.web.ts",
      ),
      "@dr.pogodin/react-native-static-server": path.resolve(
        platformDir,
        "staticServer.web.ts",
      ),
      "expo-notifications": path.resolve(platformDir, "notifications.web.ts"),
      "expo-crypto": path.resolve(platformDir, "cryptoExpo.web.ts"),
      "expo-glass-effect": path.resolve(platformDir, "glassEffect.web.ts"),
      "expo-asset": path.resolve(platformDir, "asset.web.ts"),
      "expo-audio": path.resolve(platformDir, "audio.web.ts"),
      "expo-device": path.resolve(platformDir, "device.web.ts"),
      "react-native-fast-confetti": path.resolve(
        platformDir,
        "confetti.web.ts",
      ),
      "react-native-render-html": path.resolve(
        platformDir,
        "renderHtml.web.tsx",
      ),
      "expo-background-fetch": path.resolve(
        platformDir,
        "backgroundFetch.web.ts",
      ),
      "expo-task-manager": path.resolve(platformDir, "taskManager.web.ts"),
      "expo-background-task": path.resolve(
        platformDir,
        "backgroundTask.web.ts",
      ),
      "@react-native-community/datetimepicker": path.resolve(
        platformDir,
        "datetimepicker.web.tsx",
      ),
      "@react-native-community/netinfo": path.resolve(
        platformDir,
        "netinfo.web.ts",
      ),
      // Suppress posthog optional dependency warnings
      "react-native-device-info": emptyShim,
      "react-native-localize": emptyShim,
      "react-native-navigation": emptyShim,
      "posthog-react-native-session-replay": emptyShim,
    };

    if (webShims[moduleName]) {
      return {
        filePath: webShims[moduleName],
        type: "sourceFile",
      };
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
