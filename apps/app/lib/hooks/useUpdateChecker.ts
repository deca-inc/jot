import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { type UpdateState, updateChecker } from "../platform/updateChecker";

/**
 * Hook that subscribes to the app update checker.
 *
 * Starts the checker on first mount (using the app version from
 * expo-constants) and returns the current update state plus an install action.
 *
 * useEffect is acceptable here — we're subscribing to an external system.
 */
export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>(updateChecker.getState());

  useEffect(() => {
    const version = Constants.expoConfig?.version ?? "0.0.0";
    updateChecker.start(version);

    const unsubscribe = updateChecker.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  const install = () => updateChecker.install();
  const checkNow = () => updateChecker.check();

  return { state, install, checkNow };
}
