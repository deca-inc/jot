import { useState, useEffect } from "react";
import {
  modelDownloadStatus,
  type DownloadStatus,
} from "./modelDownloadStatus";

/**
 * React hook to subscribe to model download status
 * Returns the current download status (or null if no download in progress)
 */
export function useModelDownloadStatus(): DownloadStatus | null {
  const [status, setStatus] = useState<DownloadStatus | null>(
    modelDownloadStatus.getCurrentDownload()
  );

  useEffect(() => {
    const unsubscribe = modelDownloadStatus.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

