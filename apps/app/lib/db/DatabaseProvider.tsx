/**
 * Platform-agnostic re-export of DatabaseProvider.
 *
 * Metro/webpack resolves `.native.tsx` or `.web.tsx` at runtime based on
 * platform. This barrel file satisfies TypeScript's module resolution
 * (which doesn't understand platform extensions) by re-exporting from
 * the native version for type-checking purposes.
 */

export { DatabaseProvider, useDatabase } from "./DatabaseProvider.native";
