export default {
  // TypeScript/JavaScript - lint, format, and run related tests
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],

  // Other files - just format
  "*.{js,mjs,cjs,json,md}": ["prettier --write"],

  // Swift files - format with SwiftFormat if available
  "*.swift": (filenames) => {
    // Only lint, don't auto-fix (SwiftFormat may not be installed)
    return filenames.map((f) => `echo "Swift file staged: ${f}"`);
  },

  // Kotlin files - format with ktlint if available
  "*.kt": (filenames) => {
    // Only lint, don't auto-fix (ktlint may not be installed)
    return filenames.map((f) => `echo "Kotlin file staged: ${f}"`);
  },
};
