module.exports = ({ config }) => {
  const isDev = process.env.EXPO_PUBLIC_APP_VARIANT !== "production";

  return {
    ...config,
    name: isDev ? "Jot (Dev)" : "Jot",
    owner: "beta-zeta-inc",
    slug: "jot",
    scheme: "jot",
    version: "1.0.10",
    orientation: "portrait",
    icon: isDev ? "./assets/icon-dev.png" : "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isDev ? "com.betazeta.jot.dev" : "com.betazeta.jot",
      appleTeamId: "RQ4KTR2333",
      infoPlist: {
        UIBackgroundModes: ["fetch", "processing", "remote-notification"],
        BGTaskSchedulerPermittedIdentifiers: [
          "com.betazeta.jot.background-generation",
          "com.betazeta.jot.background-download",
        ],
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription:
          "Jot uses the microphone to transcribe voice notes using on-device speech recognition.",
        NSSpeechRecognitionUsageDescription:
          "Jot uses on-device speech recognition to transcribe your voice notes into text.",
        NSPhotoLibraryUsageDescription:
          "Jot allows you to attach photos from your library to journal entries.",
      },
      entitlements: {
        "com.apple.security.application-groups": [
          "group.com.betazeta.jot.widgets",
        ],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: isDev
          ? "./assets/adaptive-icon-dev.png"
          : "./assets/adaptive-icon.png",
        backgroundColor: "#000000",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: isDev ? "com.dotdotdot.jot.dev" : "com.dotdotdot.jot",
      permissions: [
        "RECEIVE_BOOT_COMPLETED",
        "WAKE_LOCK",
        "FOREGROUND_SERVICE",
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "RECORD_AUDIO",
      ],
      requestLegacyExternalStorage: true,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-sqlite",
        {
          useSQLCipher: true,
        },
      ],
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 26,
            packagingOptions: {
              pickFirst: ["**/libcrypto.so", "**/libssl.so"],
            },
            manifestPlaceholders: {
              "android.max_page_size": "4096",
            },
          },
        },
      ],
      [
        "expo-notifications",
        {
          sounds: [],
        },
      ],
      "@bacons/apple-targets",
      "./plugins/withJotWidget",
    ],
    updates: {
      url: "https://u.expo.dev/0218f474-abc5-4575-ab99-0fa81a34e435",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      eas: {
        projectId: "0218f474-abc5-4575-ab99-0fa81a34e435",
      },
    },
  };
};
