import React from "react";
import { CountdownComposer } from "./CountdownComposer";

export interface CountdownViewerProps {
  entryId: number;
  onClose?: () => void;
}

/**
 * Screen for viewing a countdown (e.g., when opened from a notification).
 * Currently renders the same UI as CountdownComposer.
 * Future: Customize to show a more celebratory/display-focused view.
 */
export function CountdownViewer({ entryId, onClose }: CountdownViewerProps) {
  return (
    <CountdownComposer entryId={entryId} onSave={onClose} onCancel={onClose} />
  );
}
