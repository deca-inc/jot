module.exports = {
  preset: "react-native",
  testMatch: ["**/*.jest.test.ts", "**/*.jest.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|expo|@expo|@testing-library|marked|marked-highlight)/)",
  ],
  testEnvironment: "node",
};
