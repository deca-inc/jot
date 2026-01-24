import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules",
      "android",
      "ios",
      "**/*.jest.test.ts",
      "**/*.jest.test.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "components/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/index.ts",
        "lib/db/migrations/**",
      ],
    },
  },
});
