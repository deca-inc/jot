/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin to ensure cmake is available for native builds.
 * Required for @dr.pogodin/react-native-static-server which builds Lighttpd.
 *
 * On EAS Build, cmake is installed via brew to /opt/homebrew/bin but
 * Xcode's build scripts don't have that in PATH. This plugin adds a
 * pre_install hook to the Podfile that creates symlinks to /usr/local/bin.
 */
const withCmake = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );

      if (!fs.existsSync(podfilePath)) {
        console.warn("[withCmake] Podfile not found");
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, "utf8");

      // Check if we already added our hook
      if (podfileContent.includes("[withCmake]")) {
        console.log("[withCmake] cmake setup already present in Podfile");
        return config;
      }

      // The pre_install hook to add
      const cmakeHook = `
# [withCmake] Ensure cmake is available for react-native-static-server (Lighttpd build)
# On EAS Build, cmake is installed via brew but may not be in Xcode's PATH
pre_install do |installer|
  # Check common cmake locations and symlink to /usr/local/bin if needed
  cmake_paths = [
    '/opt/homebrew/bin/cmake',           # Apple Silicon Homebrew
    '/usr/local/Homebrew/bin/cmake',     # Intel Homebrew
  ]

  cmake_path = cmake_paths.find { |p| File.exist?(p) }

  if cmake_path && !File.exist?('/usr/local/bin/cmake')
    puts "[withCmake] Setting up cmake symlink: #{cmake_path} -> /usr/local/bin/cmake"
    system("sudo mkdir -p /usr/local/bin")
    system("sudo ln -sf #{cmake_path} /usr/local/bin/cmake")
  elsif File.exist?('/usr/local/bin/cmake')
    puts "[withCmake] cmake already available at /usr/local/bin/cmake"
  else
    puts "[withCmake] WARNING: cmake not found in expected locations"
  end

  # Also check for pkg-config
  pkgconfig_paths = [
    '/opt/homebrew/bin/pkg-config',
    '/usr/local/Homebrew/bin/pkg-config',
  ]

  pkgconfig_path = pkgconfig_paths.find { |p| File.exist?(p) }

  if pkgconfig_path && !File.exist?('/usr/local/bin/pkg-config')
    puts "[withCmake] Setting up pkg-config symlink: #{pkgconfig_path} -> /usr/local/bin/pkg-config"
    system("sudo ln -sf #{pkgconfig_path} /usr/local/bin/pkg-config")
  end
end

`;

      // Insert the hook after 'prepare_react_native_project!'
      const insertPoint = "prepare_react_native_project!";
      const insertIndex = podfileContent.indexOf(insertPoint);

      if (insertIndex === -1) {
        console.warn("[withCmake] Could not find insertion point in Podfile");
        return config;
      }

      const insertPosition = insertIndex + insertPoint.length;
      podfileContent =
        podfileContent.slice(0, insertPosition) +
        "\n" +
        cmakeHook +
        podfileContent.slice(insertPosition);

      fs.writeFileSync(podfilePath, podfileContent);
      console.log("[withCmake] Added cmake setup to Podfile");

      return config;
    },
  ]);
};

module.exports = withCmake;
