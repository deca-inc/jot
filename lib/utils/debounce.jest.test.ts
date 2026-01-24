import { renderHook, act } from "@testing-library/react-native";
import { debounce, throttle, useDebounce, useThrottle } from "./debounce";

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

// Pure function tests (migrated from Vitest)
describe("debounce (pure function)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("delays function execution until wait time has elapsed", () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on subsequent calls", () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced();
    jest.advanceTimersByTime(50);
    debounced();
    jest.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes arguments to the debounced function", () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced("arg1", "arg2");
    jest.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("uses the last call's arguments", () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);

    debounced("first");
    debounced("second");
    debounced("third");
    jest.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  describe("cancel", () => {
    it("cancels pending execution", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced.cancel();
      jest.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });

    it("does nothing if no pending execution", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced.cancel();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("flush", () => {
    it("executes immediately and clears pending timeout", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced("pending");
      jest.advanceTimersByTime(50);

      debounced.flush("flushed");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("flushed");

      // Original pending call should be cancelled
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("works without pending call", () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced.flush("direct");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("direct");
    });
  });
});

describe("throttle (pure function)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("executes immediately on first call", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores calls during the wait period but executes after", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    throttled("second");
    throttled("third");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first");

    jest.advanceTimersByTime(100);

    // Should execute with the last args ("third")
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("third");
  });

  it("executes trailing call after wait period with stored args", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    expect(fn).toHaveBeenCalledTimes(1);

    // After wait period, it executes the trailing call with lastArgs
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("first");
  });

  it("allows new throttle period after previous completes", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // immediate + trailing

    // New call should execute immediately
    throttled("second");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith("second");
  });

  it("passes arguments correctly", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    throttled("arg1", "arg2");
    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  describe("cancel", () => {
    it("cancels pending trailing call", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second");

      expect(fn).toHaveBeenCalledTimes(1);

      throttled.cancel();
      jest.advanceTimersByTime(100);

      // Trailing call should be cancelled
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets the throttle state", () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled.cancel();

      // After cancel, should be able to execute immediately again
      throttled("after-cancel");
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith("after-cancel");
    });
  });

  it("handles rapid succession of calls", () => {
    const fn = jest.fn();
    const throttled = throttle(fn, 100);

    // Rapid calls
    for (let i = 0; i < 10; i++) {
      throttled(i);
    }

    // Only first call executes immediately
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);

    // After wait period, last args are used
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(9);
  });
});
