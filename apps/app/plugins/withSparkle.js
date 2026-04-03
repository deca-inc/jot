/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const {
  withDangerousMod,
  withInfoPlist,
  withEntitlementsPlist,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin to set up Sparkle auto-updates for macOS.
 *
 * This plugin:
 * 1. Adds Sparkle configuration to Info.plist (SUFeedURL, SUPublicEDKey, etc.)
 * 2. Adds required network entitlements
 * 3. Adds Sparkle framework dependency via Podfile
 *
 * Usage in app.config.js:
 *   ["./plugins/withSparkle", {
 *     feedURL: "https://github.com/deca-inc/jot/releases/latest/download/appcast.xml",
 *     publicEDKey: "YOUR_ED25519_PUBLIC_KEY"
 *   }]
 */

const withSparkleInfoPlist = (config, { feedURL, publicEDKey }) => {
  return withInfoPlist(config, (config) => {
    // Only apply to macOS builds
    if (config.modRequest.platform !== "macos") {
      return config;
    }

    // Sparkle feed URL - where to check for updates
    config.modResults.SUFeedURL = feedURL;

    // EdDSA public key for verifying update signatures
    if (publicEDKey) {
      config.modResults.SUPublicEDKey = publicEDKey;
    }

    // Enable automatic update checks (user can disable in app)
    config.modResults.SUEnableAutomaticChecks = true;

    // Allow Sparkle to check for updates immediately after launch
    config.modResults.SUScheduledCheckInterval = 86400; // 24 hours

    // Show release notes in update dialog
    config.modResults.SUShowReleaseNotes = true;

    console.log("[withSparkle] Added Sparkle configuration to Info.plist");

    return config;
  });
};

const withSparkleEntitlements = (config) => {
  return withEntitlementsPlist(config, (config) => {
    // Only apply to macOS builds
    if (config.modRequest.platform !== "macos") {
      return config;
    }

    // Network client entitlement for downloading updates
    config.modResults["com.apple.security.network.client"] = true;

    // File read/write for extracting and installing updates
    config.modResults["com.apple.security.files.user-selected.read-write"] =
      true;

    console.log("[withSparkle] Added Sparkle entitlements");

    return config;
  });
};

const withSparklePodfile = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      // The Sparkle pod is added via the SparkleUpdater.podspec dependency
      // So we just need to ensure the module is properly linked
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );

      if (!fs.existsSync(podfilePath)) {
        console.warn("[withSparkle] Podfile not found");
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, "utf8");

      // Check if we already added our hook
      if (podfileContent.includes("[withSparkle]")) {
        console.log("[withSparkle] Sparkle setup already present in Podfile");
        return config;
      }

      // Add a post_install hook to configure Sparkle for macOS
      const sparkleHook = `
# [withSparkle] Sparkle auto-update framework configuration
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Ensure Sparkle is only linked for macOS targets
      if target.name == 'SparkleUpdater'
        config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end
end
`;

      // Append the hook to the end of the Podfile
      // Only if there isn't already a post_install hook
      if (!podfileContent.includes("post_install")) {
        podfileContent += sparkleHook;
        fs.writeFileSync(podfilePath, podfileContent);
        console.log("[withSparkle] Added Sparkle post_install hook to Podfile");
      } else {
        console.log("[withSparkle] Existing post_install hook found, skipping");
      }

      return config;
    },
  ]);
};

const withSparkle = (config, props = {}) => {
  const {
    feedURL = "https://github.com/deca-inc/jot/releases/latest/download/appcast.xml",
    publicEDKey,
  } = props;

  if (!feedURL) {
    console.warn("[withSparkle] No feedURL provided");
  }

  // Apply all Sparkle configurations
  config = withSparkleInfoPlist(config, { feedURL, publicEDKey });
  config = withSparkleEntitlements(config);
  config = withSparklePodfile(config);

  return config;
};

module.exports = withSparkle;
