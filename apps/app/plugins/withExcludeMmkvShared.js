/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Exclude com.tencent:mmkv-shared from the Android build.
 *
 * react-native-mmkv ships io.github.zhongwuzw:mmkv (a fork) and
 * react-native-sherpa-onnx ships com.tencent:mmkv-shared (the original).
 * Both provide identical com.tencent.mmkv.* classes, causing a
 * checkReleaseDuplicateClasses failure. The fork is a superset, so we
 * exclude the original.
 */
const withExcludeMmkvShared = (config) => {
  return withAppBuildGradle(config, (config) => {
    const marker = "[withExcludeMmkvShared]";
    if (config.modResults.contents.includes(marker)) {
      return config;
    }

    const snippet = `
// ${marker} Exclude duplicate MMKV classes (react-native-mmkv fork vs sherpa-onnx original)
configurations.all {
    exclude group: "com.tencent", module: "mmkv-shared"
}
`;

    // Insert before the dependencies block
    config.modResults.contents = config.modResults.contents.replace(
      /^dependencies\s*\{/m,
      snippet + "dependencies {",
    );

    return config;
  });
};

module.exports = withExcludeMmkvShared;
