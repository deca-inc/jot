/**
 * Web shim for react-native-fast-confetti
 *
 * No-op component that renders nothing.
 */

import React from "react";

export interface PIConfettiMethods {
  restart: () => void;
  pause: () => void;
  resume: () => void;
}

export const PIConfetti = React.forwardRef<PIConfettiMethods>(
  function PIConfettiShim(_props, _ref) {
    return null;
  },
);
