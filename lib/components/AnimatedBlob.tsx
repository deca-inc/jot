import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, AccessibilityInfo } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

interface AnimatedBlobProps {
  width: number;
  height: number;
  color: string;
  opacity?: number;
}

interface CircleData {
  orbitAngle: Animated.Value; // Angle around the center point
  distance: Animated.Value; // Distance from center (in/out motion)
  radius: number; // Fixed size for each circle
}

/**
 * Creates 5 circles that orbit around a center point below the screen
 * Circles move in/out radially and rotate around the center
 */
export function AnimatedBlob({
  width,
  height,
  color,
  opacity = 0.6,
}: AnimatedBlobProps) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [circlePositions, setCirclePositions] = useState<
    Array<{ x: number; y: number; r: number }>
  >([]);
  const positionsRef = useRef<Array<{ x: number; y: number; r: number }>>([]);

  // Center point is way below the screen
  const centerX = width / 2;
  const centerY = height + height * 0.5; // Position well below the visible area

  // Create 5 circles with various sizes
  const numCircles = 5;
  const circlesRef = useRef<CircleData[]>(
    Array.from({ length: numCircles }, (_, i) => {
      const baseRadius = height * (0.15 + (i % 3) * 0.08); // Various sizes
      const baseDistance = height * (0.4 + i * 0.12); // Different starting distances
      const initialAngle = (i / numCircles) * Math.PI * 2; // Stagger starting angles

      return {
        orbitAngle: new Animated.Value(initialAngle / (Math.PI * 2)), // Normalize to 0-1
        distance: new Animated.Value(baseDistance),
        radius: baseRadius,
      };
    })
  ).current;

  // Check for reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled
    );
    return () => subscription.remove();
  }, []);

  // Update circle positions - optimized for smooth rendering
  useEffect(() => {
    if (reduceMotionEnabled) {
      // Static positions
      const staticPositions = circlesRef.map((circle, i) => {
        const angle = (i / numCircles) * Math.PI * 2;
        const distance = height * (0.4 + i * 0.12);
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        return { x, y, r: circle.radius };
      });
      setCirclePositions(staticPositions);
      return;
    }

    let animationFrameId: number;
    let isActive = true;
    let lastStateUpdate = 0;
    const STATE_UPDATE_INTERVAL = 16; // Update React state every ~16ms (60fps)

    const updatePositions = () => {
      if (!isActive) return;

      // Always calculate positions every frame for smoothness
      const positions = circlesRef.map((circle) => {
        // Get current angle and distance
        const angle = (circle.orbitAngle as any).__getValue() * Math.PI * 2;
        const distance = (circle.distance as any).__getValue();

        // Calculate position: orbit around center point
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        return { x, y, r: circle.radius };
      });

      // Update ref immediately for smooth rendering
      positionsRef.current = positions;

      // Update state every frame for maximum smoothness
      // Use requestAnimationFrame timing to ensure smooth updates
      const now = performance.now();
      if (now - lastStateUpdate >= STATE_UPDATE_INTERVAL) {
        // Use functional update to ensure we get latest positions
        setCirclePositions(() => positions.map((p) => ({ ...p })));
        lastStateUpdate = now;
      }

      animationFrameId = requestAnimationFrame(updatePositions);
    };

    // Start continuous update loop
    lastStateUpdate = performance.now();
    animationFrameId = requestAnimationFrame(updatePositions);

    return () => {
      isActive = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [reduceMotionEnabled, circlesRef, width, height, centerX, centerY]);

  // Animate circles - orbit around center and move in/out
  useEffect(() => {
    if (reduceMotionEnabled) return;

    const animations = circlesRef.map((circle, i) => {
      // Rotation - orbit around center point with smooth linear easing
      const baseDistance = height * (0.4 + i * 0.12);
      const orbitAnim = Animated.loop(
        Animated.timing(circle.orbitAngle, {
          toValue: 1,
          duration: 12000 + i * 2000, // Different speeds per circle
          easing: Easing.linear, // Perfectly linear for smooth rotation
          useNativeDriver: false,
        })
      );

      // Radial motion - move in and out from center with smooth easing
      const radialAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(circle.distance, {
            toValue: baseDistance * 1.3, // Move out
            duration: 8000 + i * 1000,
            easing: Easing.bezier(0.4, 0, 0.2, 1), // Smooth bezier curve
            useNativeDriver: false,
          }),
          Animated.timing(circle.distance, {
            toValue: baseDistance * 0.7, // Move in
            duration: 8000 + i * 1000,
            easing: Easing.bezier(0.4, 0, 0.2, 1), // Smooth bezier curve
            useNativeDriver: false,
          }),
        ])
      );

      return { orbitAnim, radialAnim };
    });

    // Start all animations
    animations.forEach(({ orbitAnim, radialAnim }) => {
      orbitAnim.start();
      radialAnim.start();
    });

    return () => {
      animations.forEach(({ orbitAnim, radialAnim }) => {
        orbitAnim.stop();
        radialAnim.stop();
      });
    };
  }, [reduceMotionEnabled, circlesRef, height]);

  // Unique gradient ID for each circle
  const gradientIds = useRef(
    Array.from(
      { length: numCircles },
      (_, i) => `circleGradient-${i}-${Math.random().toString(36).substr(2, 9)}`
    )
  ).current;

  // Initialize positions
  useEffect(() => {
    if (circlePositions.length === 0) {
      const initial = circlesRef.map((circle, i) => {
        const angle = (i / numCircles) * Math.PI * 2;
        const distance = height * (0.4 + i * 0.12);
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        return { x, y, r: circle.radius };
      });
      setCirclePositions(initial);
    }
  }, []);

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      viewBox={`0 0 ${width} ${height}`}
    >
      <Defs>
        {Array.from({ length: numCircles }, (_, i) => (
          <RadialGradient key={i} id={gradientIds[i]} cx="50%" cy="50%">
            <Stop
              offset="0%"
              stopColor={color}
              stopOpacity={opacity * (0.7 + i * 0.06)}
            />
            <Stop
              offset="50%"
              stopColor={color}
              stopOpacity={opacity * (0.5 + i * 0.04)}
            />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {(circlePositions.length > 0
        ? circlePositions
        : positionsRef.current
      ).map((pos, i) => (
        <Circle
          key={i}
          cx={pos.x}
          cy={pos.y}
          r={pos.r}
          fill={`url(#${gradientIds[i]})`}
          opacity={0.8}
        />
      ))}
    </Svg>
  );
}
