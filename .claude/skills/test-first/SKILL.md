---
name: test-first
description: Implement features using test-driven development. Write tests first, then implementation. Use when implementing new features, fixing bugs, or refactoring code.
disable-model-invocation: false
allowed-tools: Write, Edit, Bash, Read, Grep, Glob
---

# Test-First Development Workflow

Follow the Red → Green → Blue TDD cycle for all implementations.

**CRITICAL**: User review is REQUIRED after Phase 1 before proceeding to implementation.

## Phase 1: Red - Write Failing Tests

1. **Understand requirements** - Read the issue, user story, or bug report carefully
2. **Create test file** - Place tests adjacent to source: `foo.ts` → `foo.test.ts`
3. **Write specific tests**:
   - Test the happy path first
   - Test edge cases and error conditions
   - Use descriptive test names: `it("should return empty array when no entries match")`
4. **Run tests to confirm failure**:
   ```bash
   pnpm test:ts
   ```
5. Tests MUST fail before proceeding (proves they're testing something real)

## ⏸️ CHECKPOINT: User Review Required

**STOP HERE and present to user:**

- Show the failing tests
- Explain what behavior each test covers
- Ask: "These tests cover [X, Y, Z]. Should I proceed with implementation?"
- Wait for explicit approval before continuing

## Phase 2: Green - Minimal Implementation

1. **Write the simplest code** that makes tests pass
2. **Don't over-engineer** - Only implement what tests require
3. **Run tests to confirm they pass**:
   ```bash
   pnpm test:ts
   ```
4. All tests must be GREEN before proceeding

## Phase 3: Blue - Refactor

1. **Improve code quality** while keeping tests passing:
   - Extract functions if code is duplicated
   - Rename for clarity
   - Simplify complex logic
2. **Apply coding standards from CLAUDE.md**:
   - Minimize useEffect (prefer events/actions)
   - Single source of truth (database via React Query)
   - Use proper TypeScript types (no `any`)
   - Keep blocks flat (no nesting)
3. **Run tests after each refactor**:
   ```bash
   pnpm test:ts
   ```

## Phase 4: Coverage - Fill in the Gaps

1. **Run coverage to find missing branches**:
   ```bash
   pnpm coverage
   ```
2. **Review uncovered lines** in the output (look for files you modified)
3. **Add tests for important uncovered paths**:
   - Error handling branches
   - Edge cases (null, empty, boundary values)
   - Conditional logic branches
4. **Target >80% coverage** on new/modified files
5. **Re-run coverage** to confirm gaps are filled

## Quality Gates (Run Before Committing)

```bash
pnpm coverage     # Check coverage, fill gaps if needed
pnpm typecheck    # TypeScript validation
pnpm lint         # Code style check
pnpm lint:fix     # Auto-fix lint issues
pnpm test:ts      # Final test run
```

## Test File Structure

```typescript
// Jest globals are available automatically (describe, it, expect, etc.)

describe("ModuleName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks, setup test data
  });

  describe("functionName", () => {
    it("should handle the happy path", () => {
      // Arrange
      const input = "test";

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe("expected");
    });

    it("should handle edge case", () => {
      // ...
    });

    it("should throw when invalid input", () => {
      expect(() => functionName(null)).toThrow();
    });
  });
});
```

## Mocking Guidelines

- Use `jest.mock()` for module mocks
- Use `jest.fn()` for function mocks
- Use `jest.spyOn()` for partial mocks
- Always restore mocks in `afterEach` or use `jest.clearAllMocks()`

## Key Principles

- Never write production code without a failing test
- Tests should be fast (mock external dependencies)
- Tests should be independent (no shared state between tests)
- Test behavior, not implementation details
- One assertion per test when possible
