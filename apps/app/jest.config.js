module.exports = {
  preset: "react-native",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|expo-file-system|expo-asset|@testing-library|marked|marked-highlight)/)",
  ],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/lib/db/test/jestSetup.ts"],
  moduleNameMapper: {
    "^expo-file-system/legacy$":
      "<rootDir>/__mocks__/expo-file-system-legacy.js",
    "^expo-file-system$": "<rootDir>/__mocks__/expo-file-system.js",
    "^expo-asset$": "<rootDir>/__mocks__/expo-asset.js",
    "^expo-secure-store$": "<rootDir>/__mocks__/expo-secure-store.js",
    "^expo-crypto$": "<rootDir>/__mocks__/expo-crypto.js",
  },
  collectCoverageFrom: [
    "lib/**/*.ts",
    "components/**/*.ts",
    "components/**/*.tsx",
    "!**/*.test.ts",
    "!**/*.test.tsx",
    "!**/*.d.ts",
    "!**/index.ts",
    "!lib/db/migrations/**",
  ],
  coverageReporters: ["text", "html", "json-summary"],
  coverageDirectory: "./coverage",
};
