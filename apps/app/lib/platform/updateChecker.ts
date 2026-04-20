/**
 * App update checker.
 *
 * Detects new versions and handles platform-specific updates:
 *  - Web: checks a co-deployed version.json, "update" = page reload.
 *  - Tauri: checks GitHub releases + uses tauri-plugin-updater for
 *    background download and install + relaunch.
 *  - Native (iOS/Android): no-op — App Store handles updates.
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
  private buildCommit: string | null = null;
  private visibilityHandler: (() => void) | null = null;

  /** Start periodic checks. Call once on app boot. No-op on native (App Store handles updates). */
  start(currentVersion: string) {
    if (Platform.OS !== "web") return;

    this.currentVersion = currentVersion;

    // Initial check after a short delay (don't block startup)
    setTimeout(() => this.check(), 3000);

    // Periodic checks
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);

    // Also check on tab/window focus
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
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): UpdateState {
    return this.state;
  }

  /** Check for a new version. */
  async check(): Promise<void> {
    if (
      this.state.status === "available" ||
      this.state.status === "ready" ||
      this.state.status === "downloading"
    ) {
      return;
    }

    this.setState({ status: "checking" });

    try {
      const info = isTauri()
        ? await this.fetchGitHubRelease()
        : await this.fetchVersionJson();

      if (info) {
        this.setState({ status: "available", info });
        if (isTauri()) {
          this.downloadInBackground(info);
        }
      } else {
        this.setState({ status: "idle" });
      }
    } catch {
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

  /**
   * Web: check a co-deployed version.json file.
   * This is generated at build time by the deploy-web-app workflow and
   * contains { version, buildTime, commit }.
   */
  private async fetchVersionJson(): Promise<UpdateInfo | null> {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      version: string;
      buildTime?: string;
      commit?: string;
    };

    // Check by commit hash first (catches same-version redeploys)
    if (data.commit && this.buildCommit === null) {
      // First check — store current commit for future comparisons
      this.buildCommit = data.commit;
      return null;
    }

    const hasNewCommit = data.commit && data.commit !== this.buildCommit;
    const hasNewVersion = isNewerVersion(data.version, this.currentVersion);

    if (!hasNewCommit && !hasNewVersion) return null;

    return {
      version: data.version,
      publishedAt: data.buildTime,
    };
  }

  /** Tauri: check GitHub releases for latest desktop version. */
  private async fetchGitHubRelease(): Promise<UpdateInfo | null> {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const releases = (await response.json()) as Array<{
      tag_name: string;
      body?: string;
      published_at?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    }>;

    // Find the latest desktop release (tag starts with "desktop-v")
    const release = releases.find(
      (r) => r.tag_name.startsWith("desktop-v") && !r.draft && !r.prerelease,
    );
    if (!release) return null;

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
   * Falls back gracefully if the plugin isn't configured.
   */
  private async downloadInBackground(info: UpdateInfo) {
    try {
      const { invoke, Channel } = await import("@tauri-apps/api/core");

      const update = (await invoke("plugin:updater|check")) as {
        available: boolean;
        rid?: number;
      };

      if (!update?.available || update.rid == null) {
        return;
      }

      this.setState({ status: "downloading", info, progress: 0 });

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
      console.warn("[updateChecker] Tauri background download failed:", e);
    }
  }

  private async installTauri() {
    if (this.state.status === "ready") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("plugin:process|restart");
      } catch {
        window.alert(
          "Update installed. Please restart Jot to apply the update.",
        );
      }
    } else if (this.state.status === "available" && this.state.info.htmlUrl) {
      window.open(this.state.info.htmlUrl, "_blank");
    }
  }

  /**
   * Dev-only: simulate update states to preview UI without a real release.
   * Cycles through: available → downloading → ready → idle.
   */
  simulateUpdate(): void {
    const fakeInfo: UpdateInfo = {
      version: "99.0.0",
      releaseNotes: "Simulated update for UI testing.",
      publishedAt: new Date().toISOString(),
    };

    switch (this.state.status) {
      case "idle":
      case "checking":
      case "error":
        this.setState({ status: "available", info: fakeInfo });
        break;
      case "available":
        this.setState({
          status: "downloading",
          info: this.state.info,
          progress: 50,
        });
        break;
      case "downloading":
        this.setState({ status: "ready", info: this.state.info });
        break;
      case "ready":
        this.setState({ status: "idle" });
        break;
    }
  }
}

/** Singleton instance. */
export const updateChecker = new UpdateChecker();
