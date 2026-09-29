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
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Monitor,
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

function findWindowsAsset(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  const lower = assets.map((a) => ({ asset: a, name: a.name.toLowerCase() }));
  const matchers: Array<(name: string) => boolean> = [
    (n) => n.includes("windows") && n.endsWith(".msi"),
    (n) => n.endsWith("-setup.exe"),
    (n) => n.endsWith(".exe"),
  ];
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

function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.toLowerCase().includes("win");
}

export const DownloadView = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [onWindows, setOnWindows] = useState(false);

  useEffect(() => {
    setOnWindows(isWindows());
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

  const windowsAsset = useMemo(
    () => findWindowsAsset(release?.assets ?? []),
    [release],
  );

  const versionLabel = release
    ? release.name || release.tag_name
    : "No release yet";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Download Hypercore Agent</h1>
        <p className="text-sm text-muted-foreground">
          Run the agent on your Windows machine to contribute compute and
          execute functions. Windows 10 and later (x64) is supported.
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
                <CheckCircle2 className="h-4 w-4 text-[var(--status-success)]" />
                Latest: {versionLabel}
              </span>
              {release.published_at && (
                <span className="text-sm text-muted-foreground">
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

          <Card className="relative">
            {onWindows && (
              <span className="absolute -top-2.5 left-4 rounded-full border bg-background px-2 py-0.5 text-sm font-medium">
                Recommended for this device
              </span>
            )}
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border">
                  <Monitor className="h-4 w-4" />
                </span>
                Windows
              </CardTitle>
              <CardDescription>Windows 10 and later (x64)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {windowsAsset ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <FileDown className="h-3.5 w-3.5" />
                    <span className="truncate">{windowsAsset.name}</span>
                    <span className="shrink-0">
                      ({formatBytes(windowsAsset.size)})
                    </span>
                  </p>
                  <Button className="w-full" asChild>
                    <a href={windowsAsset.browser_download_url}>
                      <Download />
                      Download for Windows
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    No Windows installer attached to this release.
                  </p>
                  <Button className="w-full" variant="outline" asChild>
                    <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Get it from GitHub
                    </a>
                  </Button>
                </>
              )}
              <p className="text-sm text-muted-foreground">
                Run the .msi installer and follow the setup wizard.
              </p>
            </CardContent>
          </Card>

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
        <p className="text-center text-sm text-muted-foreground">
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
