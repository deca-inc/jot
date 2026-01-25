module.exports = {
  preset: "react-native",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|@testing-library|marked|marked-highlight)/)",
  ],
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/lib/db/test/jestSetup.ts"],
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
