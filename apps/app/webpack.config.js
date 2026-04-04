const createExpoWebpackConfigAsync = require("@expo/webpack-config");
const path = require("path");
const webpack = require("webpack");

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Redirect native module imports to web-compatible shims
  const platformDir = path.resolve(__dirname, "lib/platform");
  const shims = {
    "react-native-quick-crypto": path.resolve(
      platformDir,
      "cryptoPolyfill.web.ts",
    ),
    "react-native-argon2": path.resolve(platformDir, "argon2.web.ts"),
    "react-native-mmkv": path.resolve(platformDir, "mmkv.web.ts"),
    "expo-secure-store": path.resolve(platformDir, "secureStore.web.ts"),
    "react-native-executorch": path.resolve(platformDir, "executorch.web.ts"),
    "expo-blur": path.resolve(platformDir, "blur.web.tsx"),
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
    "react-native-fast-confetti": path.resolve(platformDir, "confetti.web.ts"),
    "react-native-render-html": path.resolve(platformDir, "renderHtml.web.tsx"),
    "expo-background-fetch": path.resolve(
      platformDir,
      "backgroundFetch.web.ts",
    ),
    "expo-task-manager": path.resolve(platformDir, "taskManager.web.ts"),
    "expo-background-task": path.resolve(platformDir, "backgroundTask.web.ts"),
    "@react-native-community/datetimepicker": path.resolve(
      platformDir,
      "datetimepicker.web.tsx",
    ),
    "@react-native-community/netinfo": path.resolve(
      platformDir,
      "netinfo.web.ts",
    ),
    // Suppress posthog optional dependency warnings
    "react-native-device-info": false,
    "react-native-localize": false,
    "@react-navigation/native": false,
    "react-native-navigation": false,
    "posthog-react-native-session-replay": false,
  };

  config.resolve.alias = {
    ...config.resolve.alias,
    ...shims,
  };

  // Provide empty fallbacks for Node.js modules used by sql.js-fts5
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
    path: false,
    crypto: false,
  };

  // Force replace native modules whose aliases don't match correctly
  const forceReplace = {
    "expo-file-system": path.resolve(platformDir, "fileSystem.web.ts"),
    "expo-sqlite": path.resolve(platformDir, "expoSqlite.web.ts"),
    "expo-notifications": path.resolve(platformDir, "notifications.web.ts"),
    "@dr.pogodin/react-native-fs": path.resolve(
      platformDir,
      "reactNativeFs.web.ts",
    ),
    "@dr.pogodin/react-native-static-server": path.resolve(
      platformDir,
      "staticServer.web.ts",
    ),
  };

  for (const [pkg, replacement] of Object.entries(forceReplace)) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        new RegExp(pkg.replace(/[/.]/g, "\\$&")),
        replacement,
      ),
    );
  }

  // Suppress "Critical dependency" warning from react-native-worklets
  config.module.exprContextCritical = false;

  return config;
};
