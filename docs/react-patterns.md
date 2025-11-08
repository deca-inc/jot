# React Patterns & Best Practices

This document outlines the React patterns we follow in this codebase to maintain clean, predictable code.

## Core Principles

### 1. Minimize useEffect (Aim for 0)

**Why**: `useEffect` creates reactive dependencies that are hard to track and often cause duplicate work, infinite loops, and race conditions.

**Instead**: Use direct event handlers and action functions.

```typescript
// ❌ BAD: Reactive detection
useEffect(() => {
  if (shouldDoWork) {
    doWork();
  }
}, [many, dependencies, here]);

// ✅ GOOD: Direct event handling
const handleUserAction = () => {
  if (shouldDoWork) {
    doWork();
  }
};
```

**When useEffect is acceptable**:
- Subscribing to external systems (WebSocket, DOM events)
- Cleanup operations on unmount
- Syncing with browser APIs (window size, scroll position)

### 2. Avoid Refs for State Tracking

**Why**: Refs bypass React's reactivity and create hidden state that doesn't trigger re-renders. They make debugging harder.

**Instead**: Derive state from props or database/store data.

```typescript
// ❌ BAD: Tracking state with refs
const hasGeneratedTitleRef = useRef(false);
if (!hasGeneratedTitleRef.current) {
  generateTitle();
  hasGeneratedTitleRef.current = true;
}

// ✅ GOOD: Derive from data
const hasTitle = entry?.title && entry.title !== "AI Conversation";
if (!hasTitle) {
  generateTitle();
}
```

**When refs are acceptable**:
- DOM manipulation (focusing inputs, scrolling)
- Storing timeout/interval IDs for cleanup
- Storing stable callbacks that don't need to trigger re-renders

### 3. Rely on Input Data (Single Source of Truth)

**Why**: Multiple sources of truth lead to sync bugs. The database is the source of truth.

**Pattern**: Read from DB via React Query → Display in UI

```typescript
// ❌ BAD: Local state that needs syncing
const [chatMessages, setChatMessages] = useState([]);
useEffect(() => {
  // Try to sync local state with DB...
  setChatMessages(entry.blocks);
}, [entry]);

// ✅ GOOD: Derive from entry directly
const displayedBlocks = entry?.blocks ?? initialBlocks;
```

### 4. Use Events and Actions, Not Reactions

**Why**: Events are explicit and easier to trace than reactive cascades.

**Pattern**: Action pattern for complex workflows

```typescript
// ❌ BAD: Chain of useEffects reacting to each other
useEffect(() => {
  if (entryCreated) {
    setNeedsGeneration(true);
  }
}, [entryCreated]);

useEffect(() => {
  if (needsGeneration) {
    generateAI();
  }
}, [needsGeneration]);

// ✅ GOOD: Sequential action
async function createConversation() {
  const entry = await createEntry();
  await generateAI(entry.id);
  await generateTitle(entry.id);
  return entry.id;
}
```

## Action Pattern

For complex workflows, use the action pattern:

```typescript
// Define action context with what actions need
interface ActionContext {
  createEntry: any;
  updateEntry: any;
  llm: any;
  onSave?: (id: number) => void;
}

// Action: encapsulates a complete workflow
async function createConversation(
  params: { userMessage: string },
  context: ActionContext
): Promise<number> {
  // 1. Create entry
  const entry = await createEntry(...);
  
  // 2. Trigger navigation immediately
  context.onSave?.(entry.id);
  
  // 3. Queue background work (don't await)
  queueBackgroundWork(entry.id);
  
  return entry.id;
}
```

**Benefits**:
- Clear, testable workflow
- Easy to understand sequence
- No hidden dependencies
- Can be called from anywhere

## Component Structure

### Data Flow

```
User Action → Event Handler → Action Function
                                    ↓
                              DB Update
                                    ↓
                            React Query Cache
                                    ↓
                              Component Re-render
```

### Example: AIChatComposer

```typescript
export function AIChatComposer({ entryId }: Props) {
  // 1. Data from React Query (single source of truth)
  const { data: entry } = useEntry(entryId);
  
  // 2. Derive display state
  const displayedBlocks = entry?.blocks ?? [];
  
  // 3. Event handlers call actions
  const handleSendMessage = async () => {
    await sendMessageWithResponse(message, entryId, ...);
  };
  
  // 4. Render derived state
  return <FlatList data={displayedBlocks} />;
}
```

## Common Patterns

### Queuing Initial Work

Instead of useEffect, queue work during render:

```typescript
const hasQueuedWork = useRef(false);

if (shouldQueueWork && !hasQueuedWork.current) {
  hasQueuedWork.current = true;
  Promise.resolve().then(() => {
    doWork();
  });
}
```

### Deriving Loading/Generating State

```typescript
// Derive from data, not refs
const isGenerating = 
  displayedBlocks.length > 0 &&
  displayedBlocks[displayedBlocks.length - 1].content === "" &&
  isLLMLoading;
```

### Handling Navigation After Work

```typescript
// Return ID immediately, queue work in background
async function createConversation() {
  const entry = await createEntry();
  
  // Navigate immediately
  navigate(entry.id);
  
  // Queue background work (don't await)
  queueBackgroundGeneration(entry.id);
  
  return entry.id;
}
```

## Anti-Patterns to Avoid

### ❌ useEffect for Orchestration
```typescript
useEffect(() => {
  if (condition1) {
    doThing1();
  }
}, [condition1]);

useEffect(() => {
  if (condition2) {
    doThing2();
  }
}, [condition2]);
```

### ❌ Refs for State
```typescript
const valueRef = useRef(0);
valueRef.current = newValue; // Not triggering re-renders!
```

### ❌ Duplicate Sources of Truth
```typescript
const [localData, setLocalData] = useState([]);
const { data: dbData } = useQuery(...);
// Now you have to sync them!
```

### ❌ Reactive Chains
```typescript
useEffect(() => {
  if (a) setB(true);
}, [a]);

useEffect(() => {
  if (b) setC(true);
}, [b]);

useEffect(() => {
  if (c) doWork();
}, [c]);
```

## Migration Guide

When refactoring components with many useEffects:

1. **Identify the single source of truth** - Usually the database
2. **Convert state to derived values** - Read from source of truth
3. **Convert useEffects to event handlers** - Make actions explicit
4. **Remove refs used for state** - Derive from data instead
5. **Create action functions** - Encapsulate complex workflows

## Summary

- **0 useEffects**: Handle everything through events and actions
- **0 refs for state**: Derive everything from data
- **Single source of truth**: Database via React Query
- **Actions, not reactions**: Explicit workflows over reactive cascades

When in doubt, ask: "Can I derive this from data?" and "Can I handle this with an event?" The answer is usually yes.

