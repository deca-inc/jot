/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const {
  withXcodeProject,
  withInfoPlist,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_TARGET_NAME = "JotWidgetExtension";
const APP_GROUP_ID = "group.com.betazeta.jot.widgets";

/**
 * Add iOS widget extension to the project
 */
const withIOSWidget = (config) => {
  // Add App Groups capability to main app
  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;

    if (!entitlements["com.apple.security.application-groups"]) {
      entitlements["com.apple.security.application-groups"] = [];
    }

    if (
      !entitlements["com.apple.security.application-groups"].includes(
        APP_GROUP_ID,
      )
    ) {
      entitlements["com.apple.security.application-groups"].push(APP_GROUP_ID);
    }

    return config;
  });

  // Update Info.plist with URL scheme for deep linking
  config = withInfoPlist(config, (config) => {
    const infoPlist = config.modResults;

    // Add URL schemes if not present
    if (!infoPlist.CFBundleURLTypes) {
      infoPlist.CFBundleURLTypes = [];
    }

    // Check if jot scheme already exists
    const jotSchemeExists = infoPlist.CFBundleURLTypes.some((urlType) =>
      urlType.CFBundleURLSchemes?.includes("jot"),
    );

    if (!jotSchemeExists) {
      infoPlist.CFBundleURLTypes.push({
        CFBundleURLName: config.ios?.bundleIdentifier || "com.betazeta.jot",
        CFBundleURLSchemes: ["jot"],
      });
    }

    return config;
  });

  // Copy widget source files and create extension
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // Find the iOS project directory
      const iosDir = path.join(projectRoot, "ios");
      const entries = fs.readdirSync(iosDir);
      const projectDirName = entries.find(
        (entry) =>
          fs.statSync(path.join(iosDir, entry)).isDirectory() &&
          !entry.startsWith(".") &&
          entry !== "Pods" &&
          entry !== "build",
      );

      if (!projectDirName) {
        console.warn("[withIOSWidget] Could not find iOS project directory");
        return config;
      }

      const projectDir = path.join(iosDir, projectDirName);
      const widgetDir = path.join(projectDir, WIDGET_TARGET_NAME);
      const widgetSourceDir = path.join(
        projectRoot,
        "native",
        "ios",
        "JotWidget",
      );

      // Create widget extension directory
      fs.mkdirSync(widgetDir, { recursive: true });

      // Copy Swift source files
      const swiftFiles = [
        "JotWidgetBundle.swift",
        "JotWidget.swift",
        "JotTimelineProvider.swift",
        "JotWidgetView.swift",
        "CountdownFormatter.swift",
        "WidgetDataStore.swift",
        "JotIntentHandler.swift",
      ];

      for (const file of swiftFiles) {
        const srcPath = path.join(widgetSourceDir, file);
        const destPath = path.join(widgetDir, file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Copy Info.plist
      const infoPlistSrc = path.join(widgetSourceDir, "Info.plist");
      const infoPlistDest = path.join(widgetDir, "Info.plist");
      if (fs.existsSync(infoPlistSrc)) {
        fs.copyFileSync(infoPlistSrc, infoPlistDest);
      }

      // Copy intent definition
      const intentSrc = path.join(
        widgetSourceDir,
        "JotWidgetConfigurationIntent.intentdefinition",
      );
      const intentDest = path.join(
        widgetDir,
        "JotWidgetConfigurationIntent.intentdefinition",
      );
      if (fs.existsSync(intentSrc)) {
        fs.copyFileSync(intentSrc, intentDest);
      }

      // Create widget entitlements
      const widgetEntitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP_ID}</string>
  </array>
</dict>
</plist>
`;
      fs.writeFileSync(
        path.join(widgetDir, `${WIDGET_TARGET_NAME}.entitlements`),
        widgetEntitlements,
      );

      // Create Assets.xcassets for widget
      const assetsDir = path.join(widgetDir, "Assets.xcassets");
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, "Contents.json"),
        JSON.stringify(
          {
            info: {
              author: "xcode",
              version: 1,
            },
          },
          null,
          2,
        ),
      );

      // Create AccentColor.colorset
      const accentDir = path.join(assetsDir, "AccentColor.colorset");
      fs.mkdirSync(accentDir, { recursive: true });
      fs.writeFileSync(
        path.join(accentDir, "Contents.json"),
        JSON.stringify(
          {
            colors: [
              {
                idiom: "universal",
              },
            ],
            info: {
              author: "xcode",
              version: 1,
            },
          },
          null,
          2,
        ),
      );

      // Create WidgetBackground.colorset
      const bgDir = path.join(assetsDir, "WidgetBackground.colorset");
      fs.mkdirSync(bgDir, { recursive: true });
      fs.writeFileSync(
        path.join(bgDir, "Contents.json"),
        JSON.stringify(
          {
            colors: [
              {
                color: {
                  "color-space": "srgb",
                  components: {
                    alpha: "1.000",
                    blue: "0.102",
                    green: "0.102",
                    red: "0.102",
                  },
                },
                idiom: "universal",
              },
            ],
            info: {
              author: "xcode",
              version: 1,
            },
          },
          null,
          2,
        ),
      );

      console.log(
        `[withIOSWidget] Widget extension files copied to ${widgetDir}`,
      );

      return config;
    },
  ]);

  // Add widget target to Xcode project
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    // Check if widget target already exists
    const targets = xcodeProject.pbxNativeTargetSection();
    const widgetTargetExists = Object.values(targets).some(
      (target) => target.name === WIDGET_TARGET_NAME,
    );

    if (widgetTargetExists) {
      console.log("[withIOSWidget] Widget target already exists");
      return config;
    }

    // Note: Adding targets programmatically is complex with expo config plugins
    // The files have been copied, but the target needs to be added manually in Xcode
    // or via a more sophisticated plugin like expo-dev-client's withXcodeProjectTarget

    console.log(
      "[withIOSWidget] Widget source files have been prepared. Please add the widget target manually in Xcode.",
    );

    return config;
  });

  return config;
};

module.exports = withIOSWidget;
