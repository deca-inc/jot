import { renderHook, act } from "@testing-library/react-native";
import { useDebounce, useThrottle } from "./debounce";

interface DebounceProps {
  value: string;
  delay: number;
}

describe("useDebounce", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 100));
    expect(result.current).toBe("initial");
  });

  it("debounces value changes", () => {
    const { result, rerender } = renderHook(
      (props: DebounceProps) => useDebounce(props.value, props.delay),
      { initialProps: { value: "first", delay: 100 } },
    );

    expect(result.current).toBe("first");

    // Change the value
    rerender({ value: "second", delay: 100 });

    // Value should still be "first" immediately after change
    expect(result.current).toBe("first");

    // Advance time partially
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current).toBe("first");

    // Advance time to complete the debounce
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current).toBe("second");
  });

  it("resets timer on rapid changes", () => {
    const { result, rerender } = renderHook(
      (props: DebounceProps) => useDebounce(props.value, props.delay),
      { initialProps: { value: "first", delay: 100 } },
    );

    rerender({ value: "second", delay: 100 });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    rerender({ value: "third", delay: 100 });
    act(() => {
      jest.advanceTimersByTime(50);
    });

    // Should still be "first" because timer keeps resetting
    expect(result.current).toBe("first");

    // Complete the debounce
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(result.current).toBe("third");
  });

  it("handles delay changes", () => {
    const { result, rerender } = renderHook(
      (props: DebounceProps) => useDebounce(props.value, props.delay),
      { initialProps: { value: "initial", delay: 100 } },
    );

    rerender({ value: "changed", delay: 200 });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    // Should still be initial because delay is now 200
    expect(result.current).toBe("initial");

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe("changed");
  });

  it("works with different value types", () => {
    // Number
    const { result: numResult } = renderHook(() => useDebounce(42, 100));
    expect(numResult.current).toBe(42);

    // Object
    const obj = { foo: "bar" };
    const { result: objResult } = renderHook(() => useDebounce(obj, 100));
    expect(objResult.current).toEqual({ foo: "bar" });

    // Null
    const { result: nullResult } = renderHook(() => useDebounce(null, 100));
    expect(nullResult.current).toBe(null);
  });
});

describe("useThrottle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial value", () => {
    const { result } = renderHook(() => useThrottle("initial", 100));
    const [value] = result.current;
    expect(value).toBe("initial");
  });

  it("provides a setter function", () => {
    const { result } = renderHook(() => useThrottle("initial", 100));
    const [, setValue] = result.current;
    expect(typeof setValue).toBe("function");
  });

  it("throttles value updates", () => {
    const { result } = renderHook(() => useThrottle("initial", 100));

    // Set multiple values rapidly
    act(() => {
      result.current[1]("first");
      result.current[1]("second");
      result.current[1]("third");
    });

    // Value should still be initial (throttled)
    expect(result.current[0]).toBe("initial");

    // After interval, should update to latest value
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe("third");
  });

  it("emits at regular intervals during continuous updates", () => {
    const { result } = renderHook(() => useThrottle(0, 100));

    // Simulate continuous updates
    act(() => {
      result.current[1](1);
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe(1);

    act(() => {
      result.current[1](2);
      result.current[1](3);
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe(3);
  });

  it("setter is stable across renders", () => {
    const { result, rerender } = renderHook(
      (props: { value: string }) => useThrottle(props.value, 100),
      { initialProps: { value: "value" } },
    );

    const firstSetter = result.current[1];
    rerender({ value: "value" });
    const secondSetter = result.current[1];

    expect(firstSetter).toBe(secondSetter);
  });
});
