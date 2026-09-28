"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@hypercore/ui/components/card";
import {
  AlertCircle,
  CheckCircle2,
  Command,
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Monitor,
  Terminal,
} from "lucide-react";

const GITHUB_OWNER = "HitishRaoP";
const GITHUB_REPO = "hypercore";
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  html_url: string;
  assets: ReleaseAsset[];
}

type Status = "loading" | "ready" | "empty" | "error";

function findAsset(
  assets: ReleaseAsset[],
  matchers: Array<(name: string) => boolean>,
): ReleaseAsset | undefined {
  const lower = assets.map((a) => ({ asset: a, name: a.name.toLowerCase() }));
  for (const matches of matchers) {
    const hit = lower.find(({ name }) => matches(name));
    if (hit) return hit.asset;
  }
  return undefined;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function detectPlatform(): "windows" | "macos" | "linux" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return null;
}

interface PlatformCard {
  id: "windows" | "macos" | "linux";
  title: string;
  description: string;
  icon: typeof Monitor;
  asset: ReleaseAsset | undefined;
  installHint: string;
}

export const DownloadView = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [platform, setPlatform] = useState<
    "windows" | "macos" | "linux" | null
  >(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    let cancelled = false;

    fetch(LATEST_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json() as Promise<ReleaseInfo>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setStatus("empty");
          return;
        }
        setRelease(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const cards: PlatformCard[] = useMemo(() => {
    const assets = release?.assets ?? [];
    return [
      {
        id: "windows",
        title: "Windows",
        description: "Windows 10 and later (x64)",
        icon: Monitor,
        asset: findAsset(assets, [
          (n) => n.includes("windows") && n.endsWith(".msi"),
          (n) => n.endsWith("-setup.exe"),
          (n) => n.endsWith(".exe"),
        ]),
        installHint: "Run the .msi installer and follow the setup wizard.",
      },
      {
        id: "macos",
        title: "macOS",
        description: "Apple Silicon and Intel",
        icon: Command,
        asset: findAsset(assets, [
          (n) => n.includes("macos") && n.endsWith(".dmg"),
          (n) => n.endsWith(".dmg"),
          (n) => n.includes("macos") && n.endsWith(".app.tar.gz"),
        ]),
        installHint: "Open the .dmg and drag Hypercore Agent to Applications.",
      },
      {
        id: "linux",
        title: "Linux",
        description: "Ubuntu 22.04+ and equivalents",
        icon: Terminal,
        asset: findAsset(assets, [
          (n) => n.endsWith(".appimage"),
          (n) => n.endsWith(".deb"),
          (n) => n.includes("linux") && n.endsWith(".app.tar.gz"),
        ]),
        installHint: "Make the .AppImage executable, or install the .deb.",
      },
    ];
  }, [release]);

  const versionLabel = release
    ? release.name || release.tag_name
    : "No release yet";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Download Hypercore Agent</h1>
        <p className="text-sm text-muted-foreground">
          Run the agent on your machine to contribute compute and execute
          functions. Pick the installer for your OS below.
        </p>
      </div>

      {status === "loading" && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for the latest release…
          </CardContent>
        </Card>
      )}

      {status === "empty" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No releases published yet</CardTitle>
            <CardDescription>
              The agent hasn&apos;t been released. Releases are published
              automatically from version tags.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                <ExternalLink />
                View releases on GitHub
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Couldn&apos;t reach the GitHub API (it may be rate-limited).
              Download directly from the releases page instead.
            </p>
            <Button asChild>
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open GitHub releases
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && release && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Latest: {versionLabel}
              </span>
              {release.published_at && (
                <span className="text-xs text-muted-foreground">
                  Published{" "}
                  {new Date(release.published_at).toLocaleDateString()}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={release.html_url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Release notes
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                    All releases
                  </a>
                </Button>
              </span>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              const recommended = platform === card.id;
              return (
                <Card key={card.id} className="relative">
                  {recommended && (
                    <span className="absolute -top-2.5 left-4 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium">
                      Recommended for this device
                    </span>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border">
                        <Icon className="h-4 w-4" />
                      </span>
                      {card.title}
                    </CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {card.asset ? (
                      <>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileDown className="h-3.5 w-3.5" />
                          <span className="truncate">{card.asset.name}</span>
                          <span className="shrink-0">
                            ({formatBytes(card.asset.size)})
                          </span>
                        </p>
                        <Button className="w-full" asChild>
                          <a href={card.asset.browser_download_url}>
                            <Download />
                            Download
                          </a>
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          No {card.title} installer attached to this release.
                        </p>
                        <Button
                          className="w-full"
                          variant="outline"
                          asChild
                        >
                          <a
                            href={RELEASES_URL}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink />
                            Get it from GitHub
                          </a>
                        </Button>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {card.installHint}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">After installing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-muted-foreground">
              <p>1. Launch Hypercore Agent.</p>
              <p>2. Point it at your control plane and register the node.</p>
              <p>3. Keep it running — deployments arrive automatically.</p>
            </CardContent>
          </Card>
        </>
      )}

      {status !== "loading" && (
        <p className="text-center text-xs text-muted-foreground">
          Installers are published on the{" "}
          <a
            className="underline underline-offset-4"
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
          >
            GitHub releases page
          </a>
          .
        </p>
      )}
    </div>
  );
};
