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

    // Check if Countdown widget receiver already exists
    const countdownReceiverExists = application.receiver.some(
      (r) =>
        r.$?.["android:name"] === `${widgetPackage}.CountdownWidgetProvider`,
    );

    if (!countdownReceiverExists) {
      application.receiver.push({
        $: {
          "android:name": `${widgetPackage}.CountdownWidgetProvider`,
          "android:label": "@string/countdown_widget_name",
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

    // Check if Jot widget receiver already exists
    const jotReceiverExists = application.receiver.some(
      (r) => r.$?.["android:name"] === `${widgetPackage}.JotWidgetProvider`,
    );

    if (!jotReceiverExists) {
      application.receiver.push({
        $: {
          "android:name": `${widgetPackage}.JotWidgetProvider`,
          "android:label": "@string/jot_widget_name",
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
              "android:resource": "@xml/jot_widget_info",
            },
          },
        ],
      });
    }

    // Add widget service for scrollable list
    if (!application.service) {
      application.service = [];
    }

    const serviceExists = application.service.some(
      (s) => s.$?.["android:name"] === `${widgetPackage}.JotWidgetService`,
    );

    if (!serviceExists) {
      application.service.push({
        $: {
          "android:name": `${widgetPackage}.JotWidgetService`,
          "android:permission": "android.permission.BIND_REMOTEVIEWS",
          "android:exported": "false",
        },
      });
    }

    // Add widget configure activity
    if (!application.activity) {
      application.activity = [];
    }

    const configActivityExists = application.activity.some(
      (a) =>
        a.$?.["android:name"] === `${widgetPackage}.JotWidgetConfigureActivity`,
    );

    if (!configActivityExists) {
      application.activity.push({
        $: {
          "android:name": `${widgetPackage}.JotWidgetConfigureActivity`,
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
            {
              $: {
                "android:scheme": "jot",
                "android:host": "create",
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
        "JotWidgetProvider.kt",
        "JotWidgetService.kt",
        "CountdownWidgetProvider.kt",
        "JotWidgetConfigureActivity.kt",
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
        "jot_widget.xml",
        "jot_widget_preview.xml",
        "jot_widget_medium.xml",
        "jot_widget_medium_preview.xml",
        "jot_widget_configure.xml",
        "jot_widget_configure_item.xml",
        "jot_widget_list_item.xml",
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
      const drawableFiles = [
        "widget_background.xml",
        "ic_widget_journal.xml",
        "ic_widget_chat.xml",
        "ic_widget_countdown.xml",
        "ic_widget_arrow_down.xml",
        "ic_widget_arrow_up.xml",
        "ic_widget_chevron_left.xml",
        "ic_widget_chevron_right.xml",
      ];
      for (const file of drawableFiles) {
        const drawableSrc = path.join(resSourceDir, "drawable", file);
        const drawableDest = path.join(drawableDir, file);
        if (fs.existsSync(drawableSrc)) {
          fs.copyFileSync(drawableSrc, drawableDest);
        }
      }

      // Copy xml files (widget info)
      const xmlDir = path.join(resDestDir, "xml");
      fs.mkdirSync(xmlDir, { recursive: true });

      const widgetInfoFiles = [
        "jot_widget_info.xml",
        "countdown_widget_info.xml",
      ];
      for (const file of widgetInfoFiles) {
        const xmlSrc = path.join(resSourceDir, "xml", file);
        const xmlDest = path.join(xmlDir, file);
        if (fs.existsSync(xmlSrc)) {
          let xmlContent = fs.readFileSync(xmlSrc, "utf8");
          // Update configure activity class name
          xmlContent = xmlContent.replace(
            /com\.dotdotdot\.jot\.widget/g,
            `${packageName}.widget`,
          );
          fs.writeFileSync(xmlDest, xmlContent);
        }
      }

      // Merge strings
      const stringsDir = path.join(resDestDir, "values");
      fs.mkdirSync(stringsDir, { recursive: true });
      const stringsSrc = path.join(resSourceDir, "values", "strings.xml");
      const stringsDest = path.join(stringsDir, "widget_strings.xml");
      if (fs.existsSync(stringsSrc)) {
        fs.copyFileSync(stringsSrc, stringsDest);
      }

      // Copy test files
      const testSourceDir = path.join(
        projectRoot,
        "native",
        "android",
        "widget-tests",
      );
      const testDestDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "test",
        "java",
        packagePath,
        "widget",
      );

      if (fs.existsSync(testSourceDir)) {
        fs.mkdirSync(testDestDir, { recursive: true });

        const testFiles = fs
          .readdirSync(testSourceDir)
          .filter((f) => f.endsWith(".kt"));

        for (const file of testFiles) {
          const srcPath = path.join(testSourceDir, file);
          const destPath = path.join(testDestDir, file);

          let content = fs.readFileSync(srcPath, "utf8");
          // Update package name if needed
          content = content.replace(
            /package com\.dotdotdot\.jot(\.dev)?\.widget/g,
            `package ${packageName}.widget`,
          );
          fs.writeFileSync(destPath, content);
        }

        console.log(`[withAndroidWidget] Test files copied to ${testDestDir}`);
      }

      // Add JUnit test dependency to build.gradle
      const buildGradlePath = path.join(
        projectRoot,
        "android",
        "app",
        "build.gradle",
      );

      if (fs.existsSync(buildGradlePath)) {
        let buildGradle = fs.readFileSync(buildGradlePath, "utf8");

        // Check if JUnit is already added
        if (
          !buildGradle.includes("testImplementation") ||
          !buildGradle.includes("junit:junit")
        ) {
          // Find the dependencies block and add JUnit
          buildGradle = buildGradle.replace(
            /dependencies\s*\{/,
            `dependencies {
    testImplementation("junit:junit:4.13.2")`,
          );
          fs.writeFileSync(buildGradlePath, buildGradle);
          console.log(
            "[withAndroidWidget] Added JUnit test dependency to build.gradle",
          );
        }
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidWidget;
