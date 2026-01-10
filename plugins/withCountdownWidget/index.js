/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { withPlugins } = require("@expo/config-plugins");
const withIOSWidget = require("./ios/withIOSWidget");
const withAndroidWidget = require("./android/withAndroidWidget");

/**
 * Expo config plugin for countdown widgets
 * Adds iOS WidgetKit extension and Android App Widget
 */
const withCountdownWidget = (config) => {
  return withPlugins(config, [withIOSWidget, withAndroidWidget]);
};

module.exports = withCountdownWidget;
