export default {
  // Format all code files with prettier
  // ESLint runs via turbo in pre-commit hook, not here (avoids SIGKILL on large commits)
  "*.{ts,tsx,js,mjs,cjs,json,md}": ["prettier --write"],

  // Swift files - log for now (SwiftFormat not installed)
  "*.swift": (filenames) => {
    return filenames.map((f) => `echo "Swift file staged: ${f}"`);
  },

  // Kotlin files - log for now (ktlint not installed)
  "*.kt": (filenames) => {
    return filenames.map((f) => `echo "Kotlin file staged: ${f}"`);
  },
};
