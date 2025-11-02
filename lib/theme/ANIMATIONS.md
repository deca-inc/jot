# Animation System

The Journal app uses subtle, spring-based animations throughout to create a premium, delightful user experience.

## Philosophy

- **Subtle, not distracting**: Animations enhance interactions without drawing attention to themselves
- **Spring physics**: Natural, organic feeling animations using React Native's `Animated.spring`
- **Accessibility first**: Automatically respects `prefers-reduced-motion` settings
- **Performance optimized**: All animations use `useNativeDriver: true` for 60fps performance

## Spring Presets

Located in `lib/theme/animations.ts`, these presets provide consistent animation behavior:

- **`subtle`**: Gentle bounce for press feedback
- **`button`**: Quick, responsive button presses
- **`card`**: Smooth card elevation/lift
- **`modal`**: Gentle entry for modals/sheets
- **`listItem`**: Staggered entrance for list items
- **`feedback`**: Quick pulse for icon interactions
- **`gentle`**: Slow, smooth transitions

## Usage in Components

### Button Component
- **Press animation**: Scales to 0.96 on press, springs back on release
- Automatically respects reduced motion preferences
- Uses `springPresets.button`

### Card Component
- **Mount animation**: Fades in with gentle spring on first render
- Uses `springPresets.gentle`

### Tab Navigation
- **Tap animation**: Subtle scale on tab selection
- Uses `springPresets.subtle`

## Adding Animations to New Components

1. Import animation utilities:
```tsx
import { springPresets, animatedHelpers } from "../theme";
```

2. Create animated values:
```tsx
const scale = useRef(new Animated.Value(1)).current;
```

3. Use spring animation:
```tsx
Animated.spring(scale, {
  toValue: 0.96,
  ...springPresets.button,
}).start();
```

4. Check for reduced motion:
```tsx
const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
  const subscription = AccessibilityInfo.addEventListener(
    "reduceMotionChanged",
    (event) => setReduceMotionEnabled(event)
  );
  return () => subscription.remove();
}, []);
```

## Component Playground

Test all animations in the Component Playground screen (accessible from Settings in dev mode). The playground includes:
- Scale animations
- Fade animations  
- Slide animations
- Built-in component animations

