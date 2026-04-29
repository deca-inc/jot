import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

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
  /**
   * Ref holding a callback the active composer registers so the layout
   * header can trigger entry creation (e.g. when user edits the title
   * before any body content exists). Using a ref avoids re-renders when
   * the callback is registered/unregistered.
   */
  createComposerEntryRef: React.MutableRefObject<
    ((title: string) => Promise<void>) | null
  >;
}

const noop = { current: null };

const ModelInfoContext = createContext<ModelInfoContextValue>({
  modelInfo: null,
  setModelInfo: () => {},
  composerEntryId: undefined,
  setComposerEntryId: () => {},
  createComposerEntryRef: noop,
});

export function ModelInfoProvider({ children }: { children: React.ReactNode }) {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [composerEntryId, setComposerEntryId] = useState<number | undefined>(
    undefined,
  );
  const createComposerEntryRef = useRef<
    ((title: string) => Promise<void>) | null
  >(null);

  const value = useMemo(
    () => ({
      modelInfo,
      setModelInfo,
      composerEntryId,
      setComposerEntryId,
      createComposerEntryRef,
    }),
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
