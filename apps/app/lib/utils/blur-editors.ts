type Listener = () => void;
const listeners = new Set<Listener>();

/** Notify all editors to blur (used when opening the drawer, etc.) */
export const blurEditors = {
  emit: () => listeners.forEach((fn) => fn()),
  listen: (fn: Listener) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
