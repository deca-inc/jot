/**
 * Tests for the Tauri download helper (web / Tauri build).
 *
 * These tests mock `@tauri-apps/api/core` (for invoke), `@tauri-apps/api`
 * (for Channel), `@tauri-apps/api/path` (for appDataDir), and
 * `@tauri-apps/plugin-fs` (for exists / mkdir) as virtual modules. None
 * of these are installed in the app package — they live in the desktop
 * build and are provided at runtime by the Tauri webview.
 */

jest.mock(
  "@tauri-apps/api/core",
  () => ({
    invoke: jest.fn(),
    Channel: jest.fn().mockImplementation(function MockChannel(this: {
      onmessage: ((message: unknown) => void) | null;
    }) {
      this.onmessage = null;
    }),
  }),
  { virtual: true },
);

jest.mock(
  "@tauri-apps/api/path",
  () => ({
    appDataDir: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  "@tauri-apps/plugin-fs",
  () => ({
    exists: jest.fn(),
    mkdir: jest.fn(),
  }),
  { virtual: true },
);

import {
  downloadModelFile,
  ensureDesktopModelDownloaded,
  getDesktopModelPath,
  isDesktopModelDownloaded,
} from "./tauriDownload.web";

const { invoke, Channel } = jest.requireMock("@tauri-apps/api/core") as {
  invoke: jest.Mock;
  Channel: jest.Mock;
};
const { appDataDir } = jest.requireMock("@tauri-apps/api/path") as {
  appDataDir: jest.Mock;
};
const { exists } = jest.requireMock("@tauri-apps/plugin-fs") as {
  exists: jest.Mock;
};

type InvokeMock = jest.Mock<
  Promise<unknown>,
  [string, Record<string, unknown>?]
>;
const mockInvoke = invoke as unknown as InvokeMock;

interface MockChannelInstance {
  onmessage: ((message: unknown) => void) | null;
}

function getLatestChannelInstance(): MockChannelInstance {
  const ChannelCtor = Channel as unknown as jest.Mock;
  const instances = ChannelCtor.mock.instances;
  if (instances.length === 0) {
    throw new Error("No Channel instances constructed yet");
  }
  return instances[instances.length - 1] as MockChannelInstance;
}

describe("tauriDownload.web", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    (Channel as unknown as jest.Mock).mockClear();
    appDataDir.mockReset();
    exists.mockReset();
  });

  describe("getDesktopModelPath", () => {
    it("joins appDataDir + models + folderName + fileName with forward slashes", async () => {
      appDataDir.mockResolvedValue(
        "/Users/parris/Library/Application Support/com.jot.desktop/",
      );

      const path = await getDesktopModelPath(
        "desktop-llama-3.2-3b",
        "llama-3.2-3b-instruct-q4_k_m.gguf",
      );

      expect(path).toBe(
        "/Users/parris/Library/Application Support/com.jot.desktop/models/desktop-llama-3.2-3b/llama-3.2-3b-instruct-q4_k_m.gguf",
      );
    });

    it("adds a trailing separator when appDataDir does not return one", async () => {
      appDataDir.mockResolvedValue("/app/data");

      const path = await getDesktopModelPath("folder", "file.gguf");

      expect(path).toBe("/app/data/models/folder/file.gguf");
    });

    it("does not double the separator when appDataDir already has one", async () => {
      appDataDir.mockResolvedValue("/app/data/");

      const path = await getDesktopModelPath("folder", "file.gguf");

      expect(path).toBe("/app/data/models/folder/file.gguf");
    });
  });

  describe("isDesktopModelDownloaded", () => {
    it("returns true when fs exists() resolves true", async () => {
      exists.mockResolvedValue(true);

      const result = await isDesktopModelDownloaded("/tmp/model.gguf");

      expect(result).toBe(true);
      expect(exists).toHaveBeenCalledWith("/tmp/model.gguf");
    });

    it("returns false when fs exists() resolves false", async () => {
      exists.mockResolvedValue(false);

      const result = await isDesktopModelDownloaded("/missing.gguf");

      expect(result).toBe(false);
    });

    it("returns false when fs exists() rejects (best-effort)", async () => {
      exists.mockRejectedValue(new Error("permission denied"));

      const result = await isDesktopModelDownloaded("/denied.gguf");

      expect(result).toBe(false);
    });
  });

  describe("downloadModelFile", () => {
    it("invokes llm_download_model with url, destPath, and a Channel", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await downloadModelFile(
        "https://example.com/model.gguf",
        "/models/model.gguf",
      );

      expect(Channel).toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_download_model",
        expect.objectContaining({
          url: "https://example.com/model.gguf",
          destPath: "/models/model.gguf",
        }),
      );
      const payload = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
      const hasChannel = Object.values(payload).some(
        (v) => v instanceof (Channel as unknown as jest.Mock),
      );
      expect(hasChannel).toBe(true);
    });

    it("forwards progress events from the Channel to onProgress", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const onProgress = jest.fn();

      const promise = downloadModelFile(
        "https://example.com/model.gguf",
        "/models/model.gguf",
        onProgress,
      );
      const safe = promise.catch(() => {
        /* handled below */
      });

      const channel = getLatestChannelInstance();
      channel.onmessage?.({ loaded: 1024, total: 10240, done: false });
      channel.onmessage?.({ loaded: 10240, total: 10240, done: true });

      await safe;
      await promise;

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 1024,
        total: 10240,
        done: false,
      });
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 10240,
        total: 10240,
        done: true,
      });
    });

    it("does not attach an onmessage handler when no onProgress callback is given", async () => {
      mockInvoke.mockResolvedValue(undefined);

      await downloadModelFile("https://x/y.gguf", "/y.gguf");

      const channel = getLatestChannelInstance();
      // Attaching should be a no-op when no listener — either null or a
      // noop function is acceptable; either way calling it must not throw.
      expect(() =>
        channel.onmessage?.({ loaded: 1, total: 2, done: false }),
      ).not.toThrow();
    });

    it("propagates errors when the Tauri invoke rejects", async () => {
      mockInvoke.mockRejectedValue(new Error("http 404"));

      await expect(
        downloadModelFile("https://bad/x.gguf", "/x.gguf"),
      ).rejects.toThrow(/http 404/);
    });
  });

  describe("ensureDesktopModelDownloaded", () => {
    const descriptor = {
      folderName: "desktop-llama-3.2-3b",
      fileName: "llama.gguf",
      url: "https://hf.co/llama.gguf",
    };

    it("skips download and returns path when model already exists", async () => {
      appDataDir.mockResolvedValue("/app/");
      exists.mockResolvedValue(true);

      const onProgress = jest.fn();
      const result = await ensureDesktopModelDownloaded(descriptor, onProgress);

      expect(result).toBe("/app/models/desktop-llama-3.2-3b/llama.gguf");
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "llm_download_model",
        expect.any(Object),
      );
      // Should synthesize a final "done" progress event so callers update UI.
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 1,
        total: 1,
        done: true,
      });
    });

    it("downloads and returns path when model is missing", async () => {
      appDataDir.mockResolvedValue("/app/");
      exists.mockResolvedValue(false);
      mockInvoke.mockResolvedValue(undefined);

      const result = await ensureDesktopModelDownloaded(descriptor);

      expect(result).toBe("/app/models/desktop-llama-3.2-3b/llama.gguf");
      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_download_model",
        expect.objectContaining({
          url: "https://hf.co/llama.gguf",
          destPath: "/app/models/desktop-llama-3.2-3b/llama.gguf",
        }),
      );
    });

    it("forwards onProgress when downloading", async () => {
      appDataDir.mockResolvedValue("/app/");
      exists.mockResolvedValue(false);
      mockInvoke.mockResolvedValue(undefined);
      const onProgress = jest.fn();

      const promise = ensureDesktopModelDownloaded(descriptor, onProgress);
      const safe = promise.catch(() => {
        /* handled below */
      });
      // Let async path resolution + exists() check run so the Channel is
      // constructed before we poke at it.
      await new Promise((r) => setImmediate(r));
      const channel = getLatestChannelInstance();
      channel.onmessage?.({ loaded: 500, total: 1000, done: false });

      await safe;
      await promise;

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 500,
        total: 1000,
        done: false,
      });
    });

    it("propagates download errors", async () => {
      appDataDir.mockResolvedValue("/app/");
      exists.mockResolvedValue(false);
      mockInvoke.mockRejectedValue(new Error("connection reset"));

      await expect(ensureDesktopModelDownloaded(descriptor)).rejects.toThrow(
        /connection reset/,
      );
    });
  });
});
