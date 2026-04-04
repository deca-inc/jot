/**
 * Web shim for @react-native-community/netinfo
 *
 * Uses navigator.onLine and online/offline events.
 */

export type NetInfoStateType =
  | "unknown"
  | "none"
  | "wifi"
  | "cellular"
  | "bluetooth"
  | "ethernet"
  | "wimax"
  | "vpn"
  | "other";

export interface NetInfoState {
  type: NetInfoStateType;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  details: null;
}

type NetInfoChangeHandler = (state: NetInfoState) => void;

function getCurrentState(): NetInfoState {
  const isConnected =
    typeof navigator !== "undefined" ? navigator.onLine : true;
  return {
    type: isConnected ? "wifi" : "none",
    isConnected,
    isInternetReachable: isConnected,
    details: null,
  };
}

const NetInfo = {
  fetch: async (): Promise<NetInfoState> => {
    return getCurrentState();
  },

  addEventListener: (callback: NetInfoChangeHandler): (() => void) => {
    if (typeof window === "undefined") {
      return () => {};
    }

    const handler = () => {
      callback(getCurrentState());
    };

    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);

    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  },

  configure: (_config: Record<string, unknown>): void => {},

  refresh: async (): Promise<NetInfoState> => {
    return getCurrentState();
  },

  useNetInfo: (): NetInfoState => {
    return getCurrentState();
  },
};

export default NetInfo;
