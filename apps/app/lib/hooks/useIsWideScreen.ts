import { useWindowDimensions } from "react-native";

const WIDE_SCREEN_BREAKPOINT = 768;

/**
 * Returns true on web and tablet-sized screens where a sidebar layout is appropriate.
 */
export function useIsWideScreen(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_SCREEN_BREAKPOINT;
}
