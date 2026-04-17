// Version is hardcoded to avoid runtime package.json lookup in compiled binary
const VERSION = "1.0.0";

const GITHUB_REPO = "deca-inc/jot";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface ReleaseInfo {
  version: string;
  url: string;
  publishedAt: string;
}

let latestRelease: ReleaseInfo | null = null;
let checkInterval: NodeJS.Timeout | null = null;

export function getCurrentVersion(): string {
  return VERSION;
}

export async function checkForUpdates(): Promise<ReleaseInfo | null> {
  try {
    // Fetch recent releases and find the latest server release (v* tag, not desktop-v*)
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "jot-server",
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const releases = (await response.json()) as Array<{
      tag_name: string;
      html_url: string;
      published_at: string;
      draft: boolean;
      prerelease: boolean;
    }>;

    // Find the latest server release: tag starts with "v" but NOT "desktop-v"
    const serverRelease = releases.find(
      (r) =>
        r.tag_name.startsWith("v") &&
        !r.tag_name.startsWith("desktop-v") &&
        !r.draft &&
        !r.prerelease,
    );

    if (!serverRelease) {
      return null;
    }

    const latestVersion = serverRelease.tag_name.replace(/^v/, "");

    latestRelease = {
      version: latestVersion,
      url: serverRelease.html_url,
      publishedAt: serverRelease.published_at,
    };

    return latestRelease;
  } catch {
    // Silently fail - don't interrupt server operation
    return null;
  }
}

export function isUpdateAvailable(): boolean {
  if (!latestRelease) return false;
  return compareVersions(latestRelease.version, getCurrentVersion()) > 0;
}

export function getLatestRelease(): ReleaseInfo | null {
  return latestRelease;
}

/**
 * Compare two semver versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Start periodic update checks
 */
export function startUpdateChecker(): void {
  // Initial check
  checkForUpdates().then(() => {
    if (isUpdateAvailable() && latestRelease) {
      printUpdateNotice();
    }
  });

  // Periodic checks
  checkInterval = setInterval(async () => {
    await checkForUpdates();
    if (isUpdateAvailable() && latestRelease) {
      printUpdateNotice();
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop periodic update checks
 */
export function stopUpdateChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function printUpdateNotice(): void {
  if (!latestRelease) return;

  console.log("");
  console.log("  ┌────────────────────────────────────────────────┐");
  console.log(
    `  │  Update available: ${getCurrentVersion()} → ${latestRelease.version.padEnd(26)}│`,
  );
  console.log("  │  Run 'jot-server update' to install            │");
  console.log("  └────────────────────────────────────────────────┘");
  console.log("");
}

/**
 * Get the install command for the current platform
 */
export function getInstallCommand(): string {
  const platform = process.platform;

  if (platform === "win32") {
    return `irm https://raw.githubusercontent.com/${GITHUB_REPO}/main/apps/server/install.ps1 | iex`;
  } else {
    return `curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/apps/server/install.sh | bash`;
  }
}
