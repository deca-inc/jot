import { Animated } from "react-native";

/**
 * Spring animation configurations for the Journal app
 * Subtle, premium-feeling animations that enhance UX without being distracting
 */

export interface SpringConfig {
  tension: number;
  friction: number;
  useNativeDriver: boolean;
}

/**
 * Spring presets for different interaction types
 */
export const springPresets = {
  // Subtle press feedback - gentle bounce
  subtle: {
    tension: 200,
    friction: 20,
    useNativeDriver: true,
  },

  // Button press - quick, responsive
  button: {
    tension: 300,
    friction: 25,
    useNativeDriver: true,
  },

  // Card elevation - smooth lift
  card: {
    tension: 280,
    friction: 28,
    useNativeDriver: true,
  },

  // Modal/Sheet entrance - gentle entry
  modal: {
    tension: 180,
    friction: 22,
    useNativeDriver: true,
  },

  // List item appearance - staggered entrance
  listItem: {
    tension: 250,
    friction: 24,
    useNativeDriver: true,
  },

  // Icon/interaction feedback - quick pulse
  feedback: {
    tension: 400,
    friction: 30,
    useNativeDriver: true,
  },

  // Smooth transitions - gentle and slow
  gentle: {
    tension: 150,
    friction: 20,
    useNativeDriver: true,
  },
} as const;

export type SpringPreset = keyof typeof springPresets;

/**
 * Helper to create animated spring
 */
export function createSpring(
  value: Animated.Value | Animated.ValueXY,
  toValue: number | { x: number; y: number },
  preset: SpringPreset = "subtle",
): Animated.CompositeAnimation {
  const config = springPresets[preset];

  if (value instanceof Animated.ValueXY) {
    const toVal = toValue as { x: number; y: number };
    return Animated.parallel([
      Animated.spring(value.x, {
        toValue: toVal.x,
        ...config,
      }),
      Animated.spring(value.y, {
        toValue: toVal.y,
        ...config,
      }),
    ]);
  } else {
    return Animated.spring(value as Animated.Value, {
      toValue: toValue as number,
      ...config,
    });
  }
}

/**
 * Common animated values and transforms
 */
export const animatedHelpers = {
  /**
   * Create a press scale animation (for buttons, cards, etc.)
   * Returns animated style that scales from 1.0 to 0.96 on press
   */
  createPressScale: () => {
    const scale = new Animated.Value(1);

    const pressIn = () => {
      Animated.spring(scale, {
        toValue: 0.96,
        ...springPresets.button,
      }).start();
    };

    const pressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        ...springPresets.button,
      }).start();
    };

    return {
      scale,
      pressIn,
      pressOut,
      style: {
        transform: [{ scale }],
      },
    };
  },

  /**
   * Create a fade-in animation
   */
  createFadeIn: () => {
    const opacity = new Animated.Value(0);

    const animate = () => {
      Animated.spring(opacity, {
        toValue: 1,
        ...springPresets.gentle,
      }).start();
    };

    return {
      opacity,
      animate,
      style: {
        opacity,
      },
    };
  },

  /**
   * Create a slide-in animation (from bottom, right, etc.)
   */
  createSlideIn: (direction: "up" | "down" | "left" | "right" = "up") => {
    const translateY = new Animated.Value(
      direction === "up" ? 20 : direction === "down" ? -20 : 0,
    );
    const translateX = new Animated.Value(
      direction === "left" ? 20 : direction === "right" ? -20 : 0,
    );
    const opacity = new Animated.Value(0);

    const animate = () => {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          ...springPresets.modal,
        }),
        Animated.spring(translateX, {
          toValue: 0,
          ...springPresets.modal,
        }),
        Animated.spring(opacity, {
          toValue: 1,
          ...springPresets.modal,
        }),
      ]).start();
    };

    return {
      translateY,
      translateX,
      opacity,
      animate,
      style: {
        opacity,
        transform: [{ translateY }, { translateX }],
      },
    };
  },
};
