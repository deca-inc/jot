module.exports = {
  preset: "react-native",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|expo-file-system|expo-asset|@testing-library|marked|marked-highlight)/)",
  ],
  testEnvironment: "node",
  moduleNameMapper: {
    "^expo-file-system/legacy$":
      "<rootDir>/__mocks__/expo-file-system-legacy.js",
    "^expo-file-system$": "<rootDir>/__mocks__/expo-file-system.js",
    "^expo-asset$": "<rootDir>/__mocks__/expo-asset.js",
    "^expo-secure-store$": "<rootDir>/__mocks__/expo-secure-store.js",
  },
};
