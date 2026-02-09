/**
 * Network Monitor
 *
 * Tracks network connectivity and type (WiFi vs cellular).
 * Used to control when large file uploads happen.
 */

import NetInfo, {
  NetInfoState,
  NetInfoStateType,
} from "@react-native-community/netinfo";

export type NetworkType = "wifi" | "cellular" | "ethernet" | "unknown" | "none";

export interface NetworkStatus {
  isConnected: boolean;
  type: NetworkType;
  isWifi: boolean;
  isCellular: boolean;
}

type NetworkStatusCallback = (status: NetworkStatus) => void;

/**
 * NetworkMonitor class for tracking connectivity
 */
class NetworkMonitor {
  private currentStatus: NetworkStatus = {
    isConnected: true,
    type: "unknown",
    isWifi: false,
    isCellular: false,
  };
  private listeners: Set<NetworkStatusCallback> = new Set();
  private unsubscribe: (() => void) | null = null;
  private isInitialized = false;

  /**
   * Initialize the network monitor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Get initial state
    const state = await NetInfo.fetch();
    this.updateStatus(state);

    // Subscribe to changes
    this.unsubscribe = NetInfo.addEventListener((state) => {
      this.updateStatus(state);
    });

    this.isInitialized = true;
  }

  /**
   * Shutdown the network monitor
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  /**
   * Check if connected to any network
   */
  isConnected(): boolean {
    return this.currentStatus.isConnected;
  }

  /**
   * Check if connected to WiFi
   */
  isWifi(): boolean {
    return this.currentStatus.isWifi;
  }

  /**
   * Check if connected to cellular
   */
  isCellular(): boolean {
    return this.currentStatus.isCellular;
  }

  /**
   * Subscribe to network status changes
   */
  subscribe(callback: NetworkStatusCallback): () => void {
    this.listeners.add(callback);
    // Immediately call with current status
    callback(this.currentStatus);

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Check if a file should be uploaded based on size and network
   */
  shouldUploadFile(fileSize: number, wifiOnlyThreshold: number): boolean {
    if (!this.currentStatus.isConnected) {
      return false;
    }

    // If file is larger than threshold, only upload on WiFi
    if (fileSize > wifiOnlyThreshold) {
      return this.currentStatus.isWifi;
    }

    // Small files can upload on any network
    return true;
  }

  private updateStatus(state: NetInfoState): void {
    const type = this.mapNetInfoType(state.type);
    const isConnected = state.isConnected ?? false;

    const newStatus: NetworkStatus = {
      isConnected,
      type,
      isWifi: type === "wifi",
      isCellular: type === "cellular",
    };

    // Only notify if status changed
    if (
      this.currentStatus.isConnected !== newStatus.isConnected ||
      this.currentStatus.type !== newStatus.type
    ) {
      this.currentStatus = newStatus;
      this.notifyListeners();
    }
  }

  private mapNetInfoType(type: NetInfoStateType): NetworkType {
    switch (type) {
      case "wifi":
        return "wifi";
      case "cellular":
        return "cellular";
      case "ethernet":
        return "ethernet";
      case "none":
        return "none";
      default:
        return "unknown";
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentStatus);
      } catch (error) {
        console.error("Network listener error:", error);
      }
    }
  }
}

// Singleton instance
let networkMonitor: NetworkMonitor | null = null;

/**
 * Get the network monitor singleton
 */
export function getNetworkMonitor(): NetworkMonitor {
  if (!networkMonitor) {
    networkMonitor = new NetworkMonitor();
  }
  return networkMonitor;
}

/**
 * Initialize the network monitor
 */
export async function initializeNetworkMonitor(): Promise<void> {
  const monitor = getNetworkMonitor();
  await monitor.initialize();
}

/**
 * Shutdown the network monitor
 */
export function shutdownNetworkMonitor(): void {
  if (networkMonitor) {
    networkMonitor.shutdown();
    networkMonitor = null;
  }
}
