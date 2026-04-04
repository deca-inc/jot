// Metro configuration for Expo with ExecuTorch model assets
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
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
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
