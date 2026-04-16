/**
 * App update checker.
 *
 * Polls the GitHub releases API to detect new versions. The install action
 * differs by platform:
 *  - Web: reloads the page to pick up newly-deployed assets.
 *  - Tauri: uses the tauri-plugin-updater to download, install, and relaunch.
 *
 * NOTE: Tauri auto-update requires a valid signing key pair configured in
 * tauri.conf.json. Until that is set up, the Tauri path falls back to
 * opening the release page in the browser.
 */

import { Platform } from "react-native";
import { isTauri } from "./isTauri";

const GITHUB_REPO = "deca-inc/jot";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  publishedAt?: string;
  htmlUrl?: string;
}

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "downloading"; info: UpdateInfo; progress: number }
  | { status: "ready"; info: UpdateInfo }
  | { status: "error"; message: string };

type Listener = (state: UpdateState) => void;

/** Compare semver strings. Returns true if remote > local. */
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split(".").map(Number);
  const l = local.split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

/** Strip tag prefixes like "v1.0.0" or "desktop-v1.0.0" → "1.0.0" */
function extractVersion(tag: string): string {
  return tag.replace(/^(desktop-)?v/, "");
}

/**
 * Singleton update checker. Manages polling, state, and listeners.
 */
class UpdateChecker {
  private state: UpdateState = { status: "idle" };
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentVersion: string = "0.0.0";
  private visibilityHandler: (() => void) | null = null;

  /** Start periodic checks. Call once on app boot. No-op on native (App Store handles updates). */
  start(currentVersion: string) {
    if (Platform.OS !== "web") return;

    this.currentVersion = currentVersion;

    // Initial check after a short delay (don't block startup)
    setTimeout(() => this.check(), 3000);

    // Periodic checks
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);

    // Also check on tab/window focus (web and Tauri only — document is
    // unavailable on native iOS/Android)
    if (
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function"
    ) {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          this.check();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  /** Stop all periodic checks. */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (
      this.visibilityHandler &&
      typeof document !== "undefined" &&
      typeof document.removeEventListener === "function"
    ) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): UpdateState {
    return this.state;
  }

  /** Check for a new version. */
  async check(): Promise<void> {
    // Don't re-check if we already know an update is available/ready
    if (
      this.state.status === "available" ||
      this.state.status === "ready" ||
      this.state.status === "downloading"
    ) {
      return;
    }

    this.setState({ status: "checking" });

    try {
      const info = await this.fetchLatestRelease();
      if (info) {
        this.setState({ status: "available", info });
        // On Tauri, start background download automatically
        if (isTauri()) {
          this.downloadInBackground(info);
        }
      } else {
        this.setState({ status: "idle" });
      }
    } catch {
      // Silently fall back to idle — network errors during polling are expected
      this.setState({ status: "idle" });
    }
  }

  /** Install the update. Web → reload. Tauri → install + relaunch. */
  async install(): Promise<void> {
    if (isTauri()) {
      await this.installTauri();
    } else {
      window.location.reload();
    }
  }

  private setState(newState: UpdateState) {
    this.state = newState;
    for (const listener of this.listeners) {
      listener(newState);
    }
  }

  private async fetchLatestRelease(): Promise<UpdateInfo | null> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const release = (await response.json()) as {
      tag_name: string;
      body?: string;
      published_at?: string;
      html_url?: string;
    };
    const version = extractVersion(release.tag_name);

    if (!isNewerVersion(version, this.currentVersion)) return null;

    return {
      version,
      releaseNotes: release.body ?? undefined,
      publishedAt: release.published_at ?? undefined,
      htmlUrl: release.html_url ?? undefined,
    };
  }

  /**
   * Tauri: use the updater plugin to download in the background.
   * Falls back gracefully if the plugin isn't configured (e.g. missing pubkey).
   */
  private async downloadInBackground(info: UpdateInfo) {
    try {
      const { invoke, Channel } = await import("@tauri-apps/api/core");

      // The updater plugin exposes a `check` command that returns update metadata
      // and a `download_and_install` command. We call check first to get the
      // plugin's own update object.
      const update = (await invoke("plugin:updater|check")) as {
        available: boolean;
        rid?: number;
      };

      if (!update?.available || update.rid == null) {
        // Plugin doesn't see an update (maybe pubkey not configured yet)
        // Stay in "available" state — user can still open the release page
        return;
      }

      this.setState({ status: "downloading", info, progress: 0 });

      // Create a channel for download progress
      const onEvent = new Channel<{
        event: "Started" | "Progress" | "Finished";
        data: { contentLength?: number; chunkLength?: number };
      }>();

      let totalBytes = 0;
      let downloadedBytes = 0;

      onEvent.onmessage = (message) => {
        if (message.event === "Started" && message.data.contentLength) {
          totalBytes = message.data.contentLength;
        } else if (message.event === "Progress" && message.data.chunkLength) {
          downloadedBytes += message.data.chunkLength;
          const progress =
            totalBytes > 0
              ? Math.round((downloadedBytes / totalBytes) * 100)
              : 0;
          this.setState({ status: "downloading", info, progress });
        } else if (message.event === "Finished") {
          this.setState({ status: "ready", info });
        }
      };

      await invoke("plugin:updater|download_and_install", {
        rid: update.rid,
        onEvent,
      });

      this.setState({ status: "ready", info });
    } catch (e) {
      console.warn(
        "[updateChecker] Tauri background download failed (signing keys may not be configured):",
        e,
      );
      // Stay in "available" state — user can still see the update banner
    }
  }

  private async installTauri() {
    if (this.state.status === "ready") {
      // Already downloaded — just relaunch
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("plugin:process|restart");
      } catch {
        // process plugin may not be installed; ask user to restart manually
        window.alert(
          "Update installed. Please restart Jot to apply the update.",
        );
      }
    } else if (this.state.status === "available" && this.state.info.htmlUrl) {
      // Download wasn't possible (e.g. no signing keys) — open release page
      window.open(this.state.info.htmlUrl, "_blank");
    }
  }
}

/** Singleton instance. */
export const updateChecker = new UpdateChecker();
