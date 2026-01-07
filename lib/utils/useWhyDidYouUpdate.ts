// Debug utility that needs to compare arbitrary prop values
import { useEffect, useRef } from "react";

/**
 * Debug hook to log which props/dependencies changed between renders
 * Usage: useWhyDidYouUpdate('ComponentName', { prop1, prop2, etc })
 */
export function useWhyDidYouUpdate(
  name: string,
  props: Record<string, unknown>,
) {
  const previousProps = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: unknown; to: unknown }> = {};

      allKeys.forEach((key) => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length > 0) {
        console.log("[why-did-you-update]", name, changedProps);
      }
    }

    previousProps.current = props;
  });
}
