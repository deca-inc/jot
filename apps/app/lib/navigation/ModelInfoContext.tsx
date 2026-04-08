import React, { createContext, useContext, useMemo, useState } from "react";

interface ModelInfo {
  displayName: string;
  openSelector: () => void;
}

interface ModelInfoContextValue {
  modelInfo: ModelInfo | null;
  setModelInfo: (info: ModelInfo | null) => void;
}

const ModelInfoContext = createContext<ModelInfoContextValue>({
  modelInfo: null,
  setModelInfo: () => {},
});

export function ModelInfoProvider({ children }: { children: React.ReactNode }) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);

  const value = useMemo(() => ({ modelInfo, setModelInfo }), [modelInfo]);

  return (
    <ModelInfoContext.Provider value={value}>
      {children}
    </ModelInfoContext.Provider>
  );
}

export function useModelInfo() {
  return useContext(ModelInfoContext);
}
