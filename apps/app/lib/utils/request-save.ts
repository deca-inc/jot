type SaveHandler = () => Promise<void>;
let handler: SaveHandler | null = null;

/**
 * Simple event for requesting the active composer to save before navigating.
 * The composer registers a save handler; the caller awaits it before navigating.
 */
export const requestSave = {
  /** Trigger the registered save handler and wait for it to complete. */
  emit: async () => {
    if (handler) {
      await handler();
    }
  },
  /** Register a save handler. Returns a cleanup function. */
  register: (fn: SaveHandler) => {
    handler = fn;
    return () => {
      if (handler === fn) {
        handler = null;
      }
    };
  },
};
