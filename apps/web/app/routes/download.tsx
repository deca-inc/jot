import { redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => [
  { title: "Download Jot - Desktop, Mobile & Web" },
  {
    name: "description",
    content:
      "Download Jot for macOS, Windows, Linux, iOS, or Android. Or use the web app — no install required.",
  },
];

type Platform =
  | "mac-arm"
  | "mac-intel"
  | "windows"
  | "linux"
  | "ios"
  | "android"
  | "unknown";

interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

interface ReleaseInfo {
  version: string;
  assets: ReleaseAsset[];
  htmlUrl: string;
}

function detectPlatformFromUA(ua: string): Platform {
  const lower = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) return "ios";
  if (/android/.test(lower)) return "android";
  if (/macintosh|mac os x/.test(lower)) {
    return "mac-arm"; // Default to ARM since most Macs sold since 2020 are ARM
  }
  if (/windows/.test(lower)) return "windows";
  if (/linux/.test(lower)) return "linux";
  return "unknown";
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
  html_url: string;
}

function getAssetForPlatform(
  assets: ReleaseAsset[],
  platform: string,
): ReleaseAsset | undefined {
  switch (platform) {
    case "mac-arm":
      return assets.find(
        (a) => a.name.includes("aarch64") && a.name.endsWith(".dmg"),
      );
    case "mac-intel":
      return assets.find(
        (a) => a.name.includes("x64") && a.name.endsWith(".dmg"),
      );
    case "windows":
      return assets.find((a) => a.name.endsWith(".msi"));
    case "linux-deb":
      return assets.find((a) => a.name.endsWith(".deb"));
    case "linux-appimage":
      return assets.find((a) => a.name.endsWith(".AppImage"));
    case "linux":
      return (
        assets.find((a) => a.name.endsWith(".AppImage")) ||
        assets.find((a) => a.name.endsWith(".deb"))
      );
    default:
      return undefined;
  }
}

async function fetchLatestRelease(
  githubToken?: string,
): Promise<ReleaseInfo | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "jot-web/1.0",
    };
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }
    const res = await fetch(
      "https://api.github.com/repos/deca-inc/jot/releases?per_page=10",
      { headers },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as GitHubRelease[];
    const desktop = releases.find(
      (r) => r.tag_name.startsWith("desktop-v") && !r.draft && !r.prerelease,
    );
    if (!desktop) return null;
    return {
      version: desktop.tag_name.replace("desktop-v", ""),
      assets: desktop.assets
        .filter((a) => !a.name.endsWith(".sig") && !a.name.endsWith(".tar.gz"))
        .map((a) => ({
          name: a.name,
          url: a.browser_download_url,
          size: a.size,
        })),
      htmlUrl: desktop.html_url,
    };
  } catch {
    return null;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ua = request.headers.get("User-Agent") || "";
  const platform = detectPlatformFromUA(ua);
  const githubToken = (
    context as { cloudflare: { env: { GITHUB_TOKEN?: string } } }
  ).cloudflare.env.GITHUB_TOKEN;

  // For mobile platforms, redirect to their stores
  if (platform === "ios") {
    return redirect(
      "https://apps.apple.com/us/app/jot-offline-notes-ai/id6755345776",
    );
  }
  if (platform === "android") {
    return redirect(
      "https://play.google.com/store/apps/details?id=com.dotdotdot.jot",
    );
  }

  const release = await fetchLatestRelease(githubToken);

  // Find the auto-download URL for the detected platform
  let autoDownloadUrl: string | null = null;
  if (release && platform !== "unknown") {
    const asset = getAssetForPlatform(release.assets, platform);
    if (asset) {
      autoDownloadUrl = asset.url;
    }
  }

  return { release, platform, autoDownloadUrl };
}

export default function Download() {
  const { release, platform, autoDownloadUrl } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (autoDownloadUrl) {
      const timer = setTimeout(() => {
        window.location.href = autoDownloadUrl;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoDownloadUrl]);

  const primaryAsset = release
    ? getAssetForPlatform(release.assets, platform)
    : undefined;

  const desktopDownloads = [
    {
      id: "mac-arm",
      label: "macOS",
      subtitle: "Apple Silicon (M1–M4)",
      icon: AppleIcon,
    },
    {
      id: "mac-intel",
      label: "macOS",
      subtitle: "Intel",
      icon: AppleIcon,
    },
    {
      id: "windows",
      label: "Windows",
      subtitle: "Windows 10+",
      icon: WindowsIcon,
    },
    {
      id: "linux-deb",
      label: "Linux",
      subtitle: ".deb (Debian/Ubuntu)",
      icon: LinuxIcon,
    },
    {
      id: "linux-appimage",
      label: "Linux",
      subtitle: ".AppImage (universal)",
      icon: LinuxIcon,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="px-4 pt-8">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5 8.25 12l7.5-7.5"
              />
            </svg>
            Back to jot-ai.app
          </Link>
        </div>
      </header>

      <section className="px-4 py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-3 text-3xl font-bold text-white">Download Jot</h1>
          <p className="mb-10 text-gray-400">
            Available on every platform. No account required.
          </p>

          {/* Auto-download banner */}
          {autoDownloadUrl && primaryAsset && (
            <div className="mb-10 rounded-xl border border-violet-500/20 bg-violet-500/5 px-6 py-4">
              <p className="text-sm text-violet-300">
                Your download should start automatically.{" "}
                <a
                  href={autoDownloadUrl}
                  className="underline transition-colors hover:text-white"
                >
                  Click here
                </a>{" "}
                if it doesn&apos;t.
              </p>
            </div>
          )}

          {/* Primary CTA — auto-detected platform */}
          {primaryAsset && (
            <div className="mb-12">
              <a
                href={primaryAsset.url}
                className="group inline-flex items-center gap-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-8 py-5 transition-all hover:border-violet-500/50 hover:bg-violet-500/15"
              >
                <svg
                  className="h-8 w-8 text-violet-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                <div>
                  <div className="text-lg font-semibold text-white">
                    Download for{" "}
                    {platform === "mac-arm" || platform === "mac-intel"
                      ? "macOS"
                      : platform === "windows"
                        ? "Windows"
                        : "Linux"}
                  </div>
                  <div className="text-sm text-violet-300/70">
                    v{release?.version} · {formatSize(primaryAsset.size)}
                  </div>
                </div>
              </a>
            </div>
          )}

          {/* Desktop Downloads */}
          <div className="mb-10">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-500">
              Desktop
            </h2>
            <div className="grid gap-2">
              {desktopDownloads.map((dl) => {
                const asset = release
                  ? getAssetForPlatform(release.assets, dl.id)
                  : undefined;
                if (!asset) return null;
                return (
                  <a
                    key={dl.id}
                    href={asset.url}
                    className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3.5 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                  >
                    <dl.icon className="h-5 w-5 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-white">
                        {dl.label}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {dl.subtitle}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {formatSize(asset.size)}
                    </span>
                  </a>
                );
              })}
            </div>
            {release && (
              <p className="mt-3 text-xs text-gray-600">
                v{release.version} ·{" "}
                <a
                  href={release.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors hover:text-gray-400"
                >
                  Release notes
                </a>
              </p>
            )}
          </div>

          {/* Mobile */}
          <div className="mb-10">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-500">
              Mobile
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <a
                href="https://apps.apple.com/us/app/jot-offline-notes-ai/id6755345776"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3.5 transition-all hover:border-white/10 hover:bg-white/[0.04]"
              >
                <AppleIcon className="h-5 w-5 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" />
                <div>
                  <span className="text-sm font-medium text-white">iOS</span>
                  <span className="ml-2 text-xs text-gray-500">App Store</span>
                </div>
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.dotdotdot.jot"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3.5 transition-all hover:border-white/10 hover:bg-white/[0.04]"
              >
                <AndroidIcon className="h-5 w-5 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" />
                <div>
                  <span className="text-sm font-medium text-white">
                    Android
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    Google Play
                  </span>
                </div>
              </a>
            </div>
          </div>

          {/* Web App */}
          <div className="mb-10">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-gray-500">
              Web
            </h2>
            <a
              href="https://app.jot-ai.app"
              className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all hover:border-violet-500/30 hover:bg-violet-500/5"
            >
              <svg
                className="h-6 w-6 shrink-0 text-gray-400 transition-colors group-hover:text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                />
              </svg>
              <div>
                <div className="text-sm font-semibold text-white">
                  Open Web App
                </div>
                <div className="text-xs text-gray-500">
                  No download required — runs in your browser
                </div>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3 text-sm text-gray-500 sm:flex-row sm:justify-center sm:gap-6">
            <Link to="/" className="transition-colors hover:text-white">
              Home
            </Link>
            <a
              href="https://github.com/deca-inc/jot"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              GitHub
            </a>
            <span className="text-gray-600">
              © {new Date().getFullYear()} Jot
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 0 0-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.04 1.445.152 2.201.347 1.186.308 2.396.6 3.27-.04.274-.2.394-.48.423-.793.096-.904-.512-1.667-.992-2.197-.18-.2-.332-.39-.422-.602-.117-.3-.07-.668.112-.962.013-.012.09-.09.133-.146.601-.657.99-1.393.862-2.135-.07-.415-.353-.696-.648-.876l-.049-.03c.037-.178.064-.362.076-.553.086-1.16-.411-1.986-.747-2.585-.34-.6-.6-1.047-.519-1.727.074-.676.27-1.109.51-1.397.242-.287.33-.467.33-.696 0-.138-.05-.258-.103-.374-.053-.117-.055-.233-.055-.35 0-.06.003-.12.013-.18.06-.392.04-.838-.105-1.344-.143-.5-.396-.921-.678-1.162-.274-.242-.567-.302-.876-.317z" />
    </svg>
  );
}

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 0 1 0 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
    </svg>
  );
}
