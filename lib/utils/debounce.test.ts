import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounce, throttle } from "./debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays function execution until wait time has elapsed", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes arguments to the debounced function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("arg1", "arg2");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("uses the last call's arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("first");
    debounced("second");
    debounced("third");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  describe("cancel", () => {
    it("cancels pending execution", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced.cancel();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });

    it("does nothing if no pending execution", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced.cancel();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("flush", () => {
    it("executes immediately and clears pending timeout", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced("pending");
      vi.advanceTimersByTime(50);

      debounced.flush("flushed");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("flushed");

      // Original pending call should be cancelled
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("works without pending call", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced.flush("direct");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("direct");
    });
  });
});

describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes immediately on first call", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores calls during the wait period but executes after", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    throttled("second");
    throttled("third");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first");

    vi.advanceTimersByTime(100);

    // Should execute with the last args ("third")
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("third");
  });

  it("executes trailing call after wait period with stored args", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    expect(fn).toHaveBeenCalledTimes(1);

    // After wait period, it executes the trailing call with lastArgs
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("first");
  });

  it("allows new throttle period after previous completes", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2); // immediate + trailing

    // New call should execute immediately
    throttled("second");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith("second");
  });

  it("passes arguments correctly", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("arg1", "arg2");
    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  describe("cancel", () => {
    it("cancels pending trailing call", () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled("first");
      throttled("second");

      expect(fn).toHaveBeenCalledTimes(1);

      throttled.cancel();
      vi.advanceTimersByTime(100);

      // Trailing call should be cancelled
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("resets the throttle state", () => {
      const fn = vi.fn();
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
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    // Rapid calls
    for (let i = 0; i < 10; i++) {
      throttled(i);
    }

    // Only first call executes immediately
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);

    // After wait period, last args are used
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(9);
  });
});
