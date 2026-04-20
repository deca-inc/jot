import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { isTauri } from "../platform/isTauri";
import { type UpdateState, updateChecker } from "../platform/updateChecker";

async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch {
      // Fall through to Expo version
    }
  }
  return Constants.expoConfig?.version ?? "0.0.0";
}

/**
 * Hook that subscribes to the app update checker.
 *
 * Starts the checker on first mount (using the Tauri app version when
 * running in a Tauri webview, otherwise the Expo version) and returns
 * the current update state plus an install action.
 *
 * useEffect is acceptable here — we're subscribing to an external system.
 */
export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>(updateChecker.getState());

  useEffect(() => {
    getAppVersion().then((version) => updateChecker.start(version));

    const unsubscribe = updateChecker.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  const install = () => updateChecker.install();
  const checkNow = () => updateChecker.check();
  const simulateUpdate = () => updateChecker.simulateUpdate();

  return { state, install, checkNow, simulateUpdate };
}
