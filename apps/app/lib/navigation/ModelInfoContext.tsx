import React, { createContext, useContext, useMemo, useState } from "react";

interface ModelInfo {
  displayName: string;
  openSelector: () => void;
}

interface ModelInfoContextValue {
  modelInfo: ModelInfo | null;
  setModelInfo: (info: ModelInfo | null) => void;
  /**
   * The entry id the composer is currently editing, even before the URL
   * reflects it. Used by the layout header to show the live title of a
   * new chat that was just created (the AI chat composer avoids calling
   * onSave/router.replace to prevent unmounting mid-response).
   */
  composerEntryId: number | undefined;
  setComposerEntryId: (id: number | undefined) => void;
}

const ModelInfoContext = createContext<ModelInfoContextValue>({
  modelInfo: null,
  setModelInfo: () => {},
  composerEntryId: undefined,
  setComposerEntryId: () => {},
});

export function ModelInfoProvider({ children }: { children: React.ReactNode }) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [composerEntryId, setComposerEntryId] = useState<number | undefined>(
    undefined,
  );

  const value = useMemo(
    () => ({ modelInfo, setModelInfo, composerEntryId, setComposerEntryId }),
    [modelInfo, composerEntryId],
  );

  return (
    <ModelInfoContext.Provider value={value}>
      {children}
    </ModelInfoContext.Provider>
  );
}

export function useModelInfo() {
  return useContext(ModelInfoContext);
}
