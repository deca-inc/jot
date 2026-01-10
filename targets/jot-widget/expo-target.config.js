/* global module */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "JotWidget",
  bundleIdentifier: ".jot-widget",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.betazeta.jot.widgets"],
  },
};
