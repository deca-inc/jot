/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const {
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Add Android widget to the project
 */
const withAndroidWidget = (config) => {
  // Add widget to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];

    // Get the package name
    const packageName = config.android?.package || "com.dotdotdot.jot";
    const widgetPackage = `${packageName}.widget`;

    // Add widget receiver
    if (!application.receiver) {
      application.receiver = [];
    }

    // Check if receiver already exists
    const receiverExists = application.receiver.some(
      (r) =>
        r.$?.["android:name"] === `${widgetPackage}.CountdownWidgetProvider`,
    );

    if (!receiverExists) {
      application.receiver.push({
        $: {
          "android:name": `${widgetPackage}.CountdownWidgetProvider`,
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.appwidget.action.APPWIDGET_UPDATE",
                },
              },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/countdown_widget_info",
            },
          },
        ],
      });
    }

    // Add widget configure activity
    if (!application.activity) {
      application.activity = [];
    }

    const configActivityExists = application.activity.some(
      (a) =>
        a.$?.["android:name"] ===
        `${widgetPackage}.CountdownWidgetConfigureActivity`,
    );

    if (!configActivityExists) {
      application.activity.push({
        $: {
          "android:name": `${widgetPackage}.CountdownWidgetConfigureActivity`,
          "android:exported": "true",
          "android:theme": "@android:style/Theme.Material.NoActionBar",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.appwidget.action.APPWIDGET_CONFIGURE",
                },
              },
            ],
          },
        ],
      });
    }

    // Add deep link intent filter to MainActivity
    const mainActivity = application.activity.find(
      (a) => a.$?.["android:name"] === ".MainActivity",
    );

    if (mainActivity) {
      if (!mainActivity["intent-filter"]) {
        mainActivity["intent-filter"] = [];
      }

      // Check if deep link filter already exists
      const deepLinkExists = mainActivity["intent-filter"].some((filter) => {
        const data = filter.data;
        return data?.some((d) => d.$?.["android:scheme"] === "jot");
      });

      if (!deepLinkExists) {
        mainActivity["intent-filter"].push({
          action: [
            {
              $: {
                "android:name": "android.intent.action.VIEW",
              },
            },
          ],
          category: [
            {
              $: {
                "android:name": "android.intent.category.DEFAULT",
              },
            },
            {
              $: {
                "android:name": "android.intent.category.BROWSABLE",
              },
            },
          ],
          data: [
            {
              $: {
                "android:scheme": "jot",
                "android:host": "countdown",
              },
            },
          ],
        });
      }
    }

    return config;
  });

  // Copy widget source files
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || "com.dotdotdot.jot";
      const packagePath = packageName.replace(/\./g, "/");

      const androidPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
      );
      const widgetSourceDir = path.join(
        projectRoot,
        "native",
        "android",
        "widget",
      );

      // Create widget package directory
      const widgetDestDir = path.join(
        androidPath,
        "java",
        packagePath,
        "widget",
      );
      fs.mkdirSync(widgetDestDir, { recursive: true });

      // Copy Kotlin files and update package name
      const kotlinFiles = [
        "WidgetDataStore.kt",
        "CountdownFormatter.kt",
        "CountdownWidgetProvider.kt",
        "CountdownWidgetConfigureActivity.kt",
      ];

      for (const file of kotlinFiles) {
        const srcPath = path.join(widgetSourceDir, file);
        const destPath = path.join(widgetDestDir, file);

        if (fs.existsSync(srcPath)) {
          let content = fs.readFileSync(srcPath, "utf8");
          // Update package name if needed
          content = content.replace(
            /package com\.dotdotdot\.jot\.widget/g,
            `package ${packageName}.widget`,
          );
          fs.writeFileSync(destPath, content);
        }
      }

      // Copy res files
      const resSourceDir = path.join(widgetSourceDir, "res");
      const resDestDir = path.join(androidPath, "res");

      // Copy layout files
      const layoutDir = path.join(resDestDir, "layout");
      fs.mkdirSync(layoutDir, { recursive: true });
      const layoutFiles = [
        "countdown_widget.xml",
        "countdown_widget_configure.xml",
        "countdown_widget_configure_item.xml",
      ];
      for (const file of layoutFiles) {
        const srcPath = path.join(resSourceDir, "layout", file);
        const destPath = path.join(layoutDir, file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Copy drawable files
      const drawableDir = path.join(resDestDir, "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      const drawableSrc = path.join(
        resSourceDir,
        "drawable",
        "widget_background.xml",
      );
      const drawableDest = path.join(drawableDir, "widget_background.xml");
      if (fs.existsSync(drawableSrc)) {
        fs.copyFileSync(drawableSrc, drawableDest);
      }

      // Copy xml files (widget info)
      const xmlDir = path.join(resDestDir, "xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlSrc = path.join(
        resSourceDir,
        "xml",
        "countdown_widget_info.xml",
      );
      let xmlDest = path.join(xmlDir, "countdown_widget_info.xml");
      if (fs.existsSync(xmlSrc)) {
        let xmlContent = fs.readFileSync(xmlSrc, "utf8");
        // Update configure activity class name
        xmlContent = xmlContent.replace(
          /com\.dotdotdot\.jot\.widget/g,
          `${packageName}.widget`,
        );
        fs.writeFileSync(xmlDest, xmlContent);
      }

      // Merge strings
      const stringsDir = path.join(resDestDir, "values");
      fs.mkdirSync(stringsDir, { recursive: true });
      const stringsSrc = path.join(resSourceDir, "values", "strings.xml");
      const stringsDest = path.join(stringsDir, "widget_strings.xml");
      if (fs.existsSync(stringsSrc)) {
        fs.copyFileSync(stringsSrc, stringsDest);
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidWidget;
