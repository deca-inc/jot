/**
 * Sync Module
 *
 * Exports all sync-related functionality.
 */

// Storage
export {
  setAccessToken,
  getAccessToken,
  clearAccessToken,
  isAccessTokenExpired,
  getAccessTokenTTL,
  storeRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  hasRefreshToken,
  clearAllTokens,
  hasAuthState,
} from "./syncAuthStorage";

// Auth Service
export {
  checkServerStatus,
  register,
  login,
  refreshAccessToken,
  logout,
  getCurrentUser,
  SyncAuthError,
  type AuthUser,
  type AuthResponse,
  type RefreshResponse,
  type ServerStatus,
  type AuthError,
} from "./syncAuthService";

// Token Manager
export {
  initializeTokenManager,
  setAuthStateCallback,
  storeAuthTokens,
  initializeAuth,
  clearAuth,
  hasAuthTokens,
  getValidAccessToken,
} from "./syncTokenManager";

// Sync Client
export {
  SyncClient,
  createSyncClient,
  type ConnectionStatus,
  type SyncClientCallbacks,
} from "./syncClient";

// Entry Yjs Mapper
export {
  entryToYjs,
  yjsToEntry,
  updateYjsMetadata,
  updateYjsBlocks,
  markYjsDeleted,
  isYjsDeleted,
  getYjsUpdatedAt,
  compareTimestamps,
  createEmptyYjsDoc,
  observeYjsDoc,
  type YjsEntryMetadata,
} from "./entryYjsMapper";

// Sync Manager
export {
  SyncManager,
  createSyncManager,
  type SyncStatus,
  type SyncManagerCallbacks,
  type EntrySyncInfo,
} from "./syncManager";

// Network Monitor
export {
  getNetworkMonitor,
  initializeNetworkMonitor,
  shutdownNetworkMonitor,
  type NetworkType,
  type NetworkStatus,
} from "./networkMonitor";

// Asset Upload
export {
  AssetUploadQueue,
  createAssetUploadQueue,
  type UploadStatus,
  type QueuedUpload,
  type AssetUploadQueueCallbacks,
} from "./assetUploadQueue";

export {
  AssetUploadService,
  initializeAssetService,
  getAssetService,
  createUploadFunction,
  type AssetMetadata,
  type UploadResponse,
} from "./assetUploadService";

// Sync Queue
export {
  SyncQueue,
  createSyncQueue,
  type SyncOperation,
  type SyncQueueStatus,
  type QueuedSync,
  type SyncQueueCallbacks,
} from "./syncQueue";

// Hooks
export {
  useSyncAuth,
  type SyncAuthStatus,
  type SyncAuthState,
  type UseSyncAuthReturn,
} from "./useSyncAuth";

export {
  useSyncStatus,
  type SyncConnectionStatus,
  type SyncStatusState,
  type UseSyncStatusReturn,
} from "./useSyncStatus";

export {
  useSyncEngine,
  type UseSyncEngineReturn,
  type QueueStats,
} from "./useSyncEngine";

export {
  useAssetUpload,
  type AssetUploadStats,
  type UseAssetUploadReturn,
} from "./useAssetUpload";
