// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  {
    files: ["**/*.ts"],
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Enforce trailing commas everywhere possible
      "comma-dangle": ["error", "always-multiline"],

      // Require newline at end of files
      "eol-last": ["error", "always"],

      // Allow unused variables with _ prefix
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Remove unused imports (no-unused-vars handles the detection)
      "no-unused-vars": "off", // Disable base rule, use TS version

      // Import sorting
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "never",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],

      // Disable rules that conflict with the codebase style
      "@typescript-eslint/no-require-imports": "off", // Allow require() for dynamic imports
    },
  },
);
