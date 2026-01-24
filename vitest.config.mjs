import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "android", "ios"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["lib/**/*.ts", "components/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        "lib/db/migrations/**",
      ],
    },
  },
});
