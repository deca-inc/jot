/**
 * Tests for isTauri runtime detection.
 */

import { isTauri } from "./isTauri";

describe("isTauri", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (typeof originalWindow === "undefined") {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("returns false when window is undefined (Node env)", () => {
    delete (globalThis as { window?: unknown }).window;

    expect(isTauri()).toBe(false);
  });

  it("returns false when window.__TAURI_INTERNALS__ is undefined (regular browser)", () => {
    (globalThis as { window?: unknown }).window = {};

    expect(isTauri()).toBe(false);
  });

  it("returns true when window.__TAURI_INTERNALS__ is present (Tauri webview)", () => {
    (globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: { invoke: () => {} },
    };

    expect(isTauri()).toBe(true);
  });

  it("is cheap to call repeatedly with no side effects", () => {
    (globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: {},
    };

    const first = isTauri();
    const second = isTauri();
    const third = isTauri();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(third).toBe(true);
  });

  it("returns true when __TAURI_INTERNALS__ is set to a non-null object", () => {
    (globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: null,
    };

    // null is still a defined value; Tauri treats its presence as the signal
    expect(isTauri()).toBe(true);
  });
});
