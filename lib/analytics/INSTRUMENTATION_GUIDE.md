# Analytics Instrumentation Guide

This guide identifies strategic locations to add tracking that will automatically capture most user interactions without needing to re-instrument everywhere.

## Privacy First ⚠️

**NEVER track personal content:**
- No journal entries
- No AI conversation content
- No user-generated text
- Only track anonymous behavioral data (clicks, navigation, performance)

## Strategic Instrumentation Points

### 1. **Button Component** (HIGHEST PRIORITY) 
**File:** `lib/components/Button.tsx`

**Why:** This is your central button component used throughout the app. Instrumenting it once covers most button clicks automatically.

**Implementation:**
```typescript
// Add at the top of Button.tsx
import { useTrackEvent } from "../analytics/hooks";

// Inside the Button component:
const trackEvent = useTrackEvent();

// In the TouchableOpacity onPress handler, wrap the existing onPress:
const handlePress = (e: any) => {
  // Track the button click
  trackEvent("button_clicked", {
    variant,
    size,
    // Extract button label if it's a string
    label: typeof children === "string" ? children : undefined,
  });
  
  // Call the original onPress
  props.onPress?.(e);
};
```

**Coverage:** This single change captures ALL button interactions across:
- Settings
- Composer actions (Save, Cancel, etc.)
- Model management
- Theme controls
- All screens

---

### 2. **SimpleNavigation Component** (HIGHEST PRIORITY)
**File:** `lib/navigation/SimpleNavigation.tsx`

**Why:** This is your navigation hub. Track screen changes here and you capture all navigation automatically.

**Implementation:**
```typescript
// Add at the top:
import { useTrackScreenView } from "../analytics/hooks";

// Add tracking in the screen change handlers:
const handleOpenSettings = useCallback(() => {
  setCurrentScreen("settings");
  // Navigation will trigger screen view in the screen component
}, []);

// Better approach: Add tracking in renderScreen() based on currentScreen
useEffect(() => {
  // Track whenever screen changes
  const screenNames: Record<Screen, string> = {
    home: "Home",
    settings: "Settings",
    playground: "Component Playground",
    composer: "Composer",
    fullEditor: "Full Editor",
    entryEditor: "Entry Editor",
  };
  
  trackEvent("screen_viewed", { 
    screen: screenNames[currentScreen] 
  });
}, [currentScreen, trackEvent]);
```

**Coverage:** Captures ALL screen navigation:
- Home ↔ Settings
- Opening composers
- Viewing entries
- All screen transitions

---

### 3. **Individual Screen Components** (MEDIUM PRIORITY)
**Files:** 
- `lib/screens/HomeScreen.tsx`
- `lib/screens/SettingsScreen.tsx`
- `lib/screens/ComposerScreen.tsx`
- etc.

**Why:** Adds context-specific screen view tracking with properties.

**Implementation (add to each screen):**
```typescript
// Add at top of component:
import { useTrackScreenView } from "../analytics/hooks";

// Inside component:
export function HomeScreen({ ... }: HomeScreenProps) {
  useTrackScreenView("Home");
  // ... rest of component
}

export function SettingsScreen({ ... }: SettingsScreenProps) {
  useTrackScreenView("Settings");
  // ... rest of component
}

export function ComposerScreen({ initialType, entryId, ... }: ComposerScreenProps) {
  useTrackScreenView("Composer", { 
    type: initialType,
    isEditing: !!entryId 
  });
  // ... rest of component
}
```

**Coverage:** Provides detailed screen view analytics with context.

---

### 4. **Entry Actions** (MEDIUM PRIORITY)
**Files:**
- `lib/screens/entryActions.ts`
- `lib/screens/journalActions.ts`
- `lib/screens/aiChatActions.ts`

**Why:** These contain the business logic for entry operations. Track here to capture:
- Entry creation
- Entry deletion
- Favoriting
- Tag operations

**Implementation:**
```typescript
// In each action function:
import { useTrackEvent } from "../analytics/hooks";

// For example in journalActions.ts:
export const createJournalEntry = async (data: CreateEntryData) => {
  trackEvent("entry_created", {
    type: "journal",
    hasBlocks: data.blocks.length > 0,
    blockTypes: data.blocks.map(b => b.type),
    // DO NOT include content, title, or text
  });
  
  // ... existing logic
};
```

**Coverage:** All entry lifecycle events.

---

### 5. **Settings Changes** (LOW PRIORITY)
**File:** `lib/screens/SettingsScreen.tsx`

**Why:** Track when users change important settings.

**Implementation:**
```typescript
// In handleTelemetryToggle:
trackEvent("telemetry_toggled", { enabled: newValue });

// In theme changes (if not already in ThemeControl):
trackEvent("theme_changed", { theme: newTheme });

// In model selection:
trackEvent("model_selected", { modelId: selectedModel });
```

**Coverage:** User preferences and configuration changes.

---

### 6. **Model Management** (LOW PRIORITY)
**File:** `lib/components/ModelManagement.tsx`

**Why:** Track model downloads and usage.

**Implementation:**
```typescript
trackEvent("model_download_started", { modelId });
trackEvent("model_download_completed", { modelId, duration });
trackEvent("model_deleted", { modelId });
```

**Coverage:** AI model lifecycle.

---

## Implementation Priority

### Phase 1 (Do These First):
1. ✅ PostHog Provider (DONE)
2. **Button Component** - Captures 80% of interactions with one change
3. **SimpleNavigation** - Captures all navigation automatically

### Phase 2 (High Value):
4. Screen components with `useTrackScreenView`
5. Entry lifecycle events

### Phase 3 (Nice to Have):
6. Settings changes
7. Model management events
8. Performance metrics

---

## What NOT to Track

❌ **Never track these:**
- Journal entry content
- AI prompts or responses
- User-entered text
- Entry titles
- Tags (they may contain personal info)
- Any markdown/HTML content
- Search queries

✅ **Safe to track:**
- Button clicks (with generic labels)
- Screen views
- Navigation patterns
- Entry counts (not content)
- Block types (e.g., "markdown", "image")
- Performance metrics
- Error types (sanitized)
- Feature usage flags

---

## Testing

To test if telemetry is working:

1. Enable telemetry in Settings > Privacy
2. Open PostHog dashboard
3. Perform actions (navigate, click buttons)
4. Verify events appear in PostHog
5. **Verify NO personal content appears in any event**

---

## Example: Complete Button Instrumentation

```typescript
// lib/components/Button.tsx
import { useTrackEvent, sanitizeProperties } from "../analytics/hooks";

export function Button({ variant, size, children, ...props }: ButtonProps) {
  const trackEvent = useTrackEvent();
  
  // ... existing code ...
  
  const handlePress = (e: any) => {
    // Track the click
    const eventProperties = sanitizeProperties({
      variant,
      size,
      label: typeof children === "string" ? children : undefined,
      disabled,
      loading,
    });
    
    trackEvent("button_clicked", eventProperties);
    
    // Call original handler
    props.onPress?.(e);
  };
  
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        {...props}
        onPress={handlePress}
        // ... rest of component
      >
        {/* ... */}
      </TouchableOpacity>
    </Animated.View>
  );
}
```

This single change instruments every button in your app automatically!

