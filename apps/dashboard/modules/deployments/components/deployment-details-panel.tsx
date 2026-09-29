"use client";

import { useState } from "react";
import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@hypercore/ui/components/collapsible";
import { Separator } from "@hypercore/ui/components/separator";
import { Sheet, SheetContent } from "@hypercore/ui/components/sheet";
import { cn } from "@hypercore/ui/lib/utils";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileCode2,
  Globe,
  GitBranch,
  GitCommitHorizontal,
  ListOrdered,
  MoreHorizontal,
  Share,
  Timer,
  X,
} from "lucide-react";
import type { Deployment, Invocation } from "@/lib/api";
import { env } from "@/lib/env";
import {
  deploymentLabel,
  deploymentTone,
  formatBytes,
  formatDuration,
  shortId,
  timeAgo,
} from "@/lib/format";

function invokeUrlFor(deploymentId: string) {
  return `${env.API_URL}/invoke/${deploymentId}`;
}

function workerUrlFor(workerName: string) {
  return `${env.API_URL}/w/${encodeURIComponent(workerName)}`;
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground">{children}</p>
  );
}

function KV({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right",
          mono && "font-mono text-[13px]",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const tone = deploymentTone(status);
  const color =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "info"
        ? "bg-sky-500"
        : tone === "danger"
          ? "bg-red-500"
          : "bg-amber-500";
  return <span className={cn("size-2 shrink-0 rounded-full", color)} />;
}

function Section({
  title,
  badge,
  right,
  children,
  defaultOpen = false,
}: {
  title: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <div className="flex items-center gap-2 px-4 py-3 md:px-6">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="shrink-0">
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleTrigger asChild>
          <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[15px] font-semibold">
            <span className="truncate">{title}</span>
            {badge}
          </button>
        </CollapsibleTrigger>
        {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
      </div>
      <CollapsibleContent className="px-4 pb-4 md:px-6">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeploymentDetailsProps {
  deployment: Deployment;
  invocations: Invocation[];
  isCurrent: boolean;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onViewLogs?: (deploymentId: string) => void;
  onBack?: () => void;
}

export function DeploymentDetailsContent({
  deployment,
  invocations,
  isCurrent,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onViewLogs,
  onBack,
}: DeploymentDetailsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const files = deployment.files ?? [];
  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const invokeUrl = invokeUrlFor(deployment.deploymentId);
  const workerUrl = workerUrlFor(deployment.workerName);

  const createdDate = new Date(deployment.createdAt);
  const createdLabel = Number.isNaN(createdDate.getTime())
    ? deployment.createdAt
    : createdDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

  const deployDurationMs = (() => {
    if (!deployment.updatedAt) return null;
    const start = new Date(deployment.createdAt).getTime();
    const end = new Date(deployment.updatedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    return end - start;
  })();

  const related = invocations.filter((i) => i.deploymentId === deployment.deploymentId);
  const failed = related.filter((i) => i.status === "failed" || i.status === "timeout").length;
  const avgDuration = related.length
    ? Math.round(
        related.reduce((s, i) => s + (i.durationMs ?? 0), 0) / related.length,
      )
    : null;

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  };

  const openUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header — mirrors "Deployment Details" bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
        {onBack && (
          <Button variant="ghost" size="icon-sm" onClick={onBack} title="Back to deployments">
            <ChevronRight className="rotate-180" />
          </Button>
        )}
        <h2 className="mr-auto text-[15px] font-semibold tracking-tight">
          Deployment Details
        </h2>
        {onPrev && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPrev}
            disabled={!hasPrev}
            title="Previous deployment"
          >
            <ChevronUp />
          </Button>
        )}
        {onNext && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            disabled={!hasNext}
            title="Next deployment"
          >
            <ChevronDown />
          </Button>
        )}        <Button variant="outline" size="sm" onClick={() => void copy("share", invokeUrl)}>
          {copied === "share" ? <Check /> : <Share />}
          Share
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewLogs?.(deployment.deploymentId)}
        >
          <ListOrdered />
          Logs
          {related.length > 0 && (
            <Badge variant="secondary" className="ml-1 font-mono">
              {related.length}
            </Badge>
          )}
        </Button>
        <span className="inline-flex shrink-0 items-center">
          <Button size="sm" className="rounded-r-none" onClick={() => openUrl(invokeUrl)}>
            Visit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-l-none border-l"
            onClick={() => openUrl(workerUrl)}
            title={`Open stable worker URL: ${workerUrl}`}
          >
            <ChevronDown />
          </Button>
        </span>
        <Button variant="ghost" size="icon-sm" title="More actions">
          <MoreHorizontal />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close details">
            <X />
          </Button>
        )}      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Top: preview + meta */}
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:p-6">
          {/* Preview */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
                <span className="size-2 rounded-full bg-muted-foreground/30" />
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {deployment.workerName}
              </span>
            </div>
            <div className="flex min-h-48 flex-col justify-between gap-3 bg-black p-4 font-mono text-xs text-emerald-300">
              <div className="space-y-1 text-muted-foreground">
                <p className="text-white/80">$ hypercore invoke {deployment.workerName}</p>
                <p className="break-all">GET {invokeUrl}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-3 text-[11px] leading-5">
                <p className="text-white/60">{"{ "}“worker”: “{deployment.workerName}”,</p>
                <p className="pl-3 text-white/60">
                  “entrypoint”: “{deployment.entrypoint}”,
                </p>
                <p className="pl-3 text-white/60">
                  “deployment”: “{shortId(deployment.deploymentId)}”{" }"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => openUrl(invokeUrl)}>
                  <ExternalLink />
                  Open live
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:text-white"
                  onClick={() => void copy("invoke", invokeUrl)}
                >
                  {copied === "invoke" ? <Check /> : <Copy />}
                  Copy URL
                </Button>
              </div>
            </div>
          </Card>

          {/* Meta */}
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-4 md:grid-cols-2">
              <div>
                <Label>Created</Label>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold uppercase">
                    {deployment.workerName.slice(0, 1)}
                  </span>
                  <span className="truncate font-medium">
                    {deployment.workerName.length > 14
                      ? `${deployment.workerName.slice(0, 14)}…`
                      : deployment.workerName}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{createdLabel}</span>
                </p>
                <p className="mt-0.5 pl-6 font-mono text-xs text-muted-foreground">
                  {timeAgo(deployment.createdAt)}
                </p>
              </div>
              <div>
                <Label>Status</Label>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <StatusDot status={deployment.status} />
                  {deploymentLabel(deployment.status)}
                  {isCurrent && (
                    <Badge variant="secondary" className="ml-1">
                      Latest
                    </Badge>
                  )}
                </p>
              </div>
              <div>
                <Label>Duration</Label>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                  <Timer className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">
                    {deployDurationMs !== null ? formatDuration(deployDurationMs) : "—"}
                  </span>
                  <span className="truncate text-muted-foreground">{timeAgo(deployment.createdAt)}</span>
                </p>
              </div>
              <div>
                <Label>Environment</Label>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                  <ArrowUpRight className="size-4 shrink-0 rounded-full border text-muted-foreground" />
                  <span className="font-medium">Production</span>
                  {isCurrent && <Badge variant="info">Current</Badge>}
                </p>
              </div>
            </div>

            {/* Domains */}
            <div>
              <Label>Domains</Label>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  <button
                    className="truncate text-left font-medium hover:underline"
                    onClick={() => openUrl(workerUrl)}
                    title={workerUrl}
                  >
                    {deployment.workerName}.hypercore
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0"
                    onClick={() => void copy("worker", workerUrl)}
                    title="Copy worker URL"
                  >
                    {copied === "worker" ? <Check /> : <Copy />}
                  </Button>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <GitBranch className="size-4 shrink-0" />
                  <span className="truncate font-mono text-[13px]" title={invokeUrl}>
                    invoke/{shortId(deployment.deploymentId)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0"
                    onClick={() => void copy("invoke2", invokeUrl)}
                    title="Copy invoke URL"
                  >
                    {copied === "invoke2" ? <Check /> : <Copy />}
                  </Button>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <GitCommitHorizontal className="size-4 shrink-0" />
                  <span className="truncate font-mono text-[13px]">
                    node {shortId(deployment.machineId)}
                  </span>
                </li>
              </ul>
            </div>

            {/* Source */}
            <div>
              <Label>Source</Label>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-[13px] font-medium">{deployment.entrypoint}</span>
                  <span className="text-muted-foreground">
                    · {files.length} file{files.length === 1 ? "" : "s"}
                    {totalBytes > 0 && ` · ${formatBytes(totalBytes)}`}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="font-mono text-[13px] text-muted-foreground">
                      {deployment.deploymentId.slice(0, 7)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {deployment.artifactKey ? "wasm artifact built" : "awaiting build artifact"}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Collapsible sections */}
        <div className="pb-4">
          <Section
            title="Deployment Settings"
            badge={
              <Badge variant="info" className="font-mono">
                {files.length} file{files.length === 1 ? "" : "s"}
              </Badge>
            }
          >
            <Card className="gap-0 py-2">
              <div className="divide-y px-4">
                <div className="py-1.5">
                  <KV label="Worker" mono>
                    {deployment.workerName}
                  </KV>
                  <KV label="Entrypoint" mono>
                    {deployment.entrypoint}
                  </KV>
                  <KV label="Deployment ID" mono>
                    {shortId(deployment.deploymentId)}
                  </KV>
                  <KV label="Node" mono>
                    {shortId(deployment.machineId)}
                  </KV>
                  <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
                    <span className="shrink-0 text-muted-foreground">Status</span>
                    <Badge variant={deploymentTone(deployment.status)}>
                      {deploymentLabel(deployment.status)}
                    </Badge>
                  </div>
                </div>
                <div className="py-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <FileCode2 className="size-3.5" />
                    Bundle manifest
                  </p>
                  {files.length === 0 ? (
                    <p className="py-1 text-sm text-muted-foreground">
                      No file manifest stored for this deployment.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {files.map((f) => (
                        <li key={f.key} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                            {f.name}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatBytes(f.size)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </Section>

          <Section
            title="Build Logs"
            right={
              <>
                <Badge variant="outline" className="hidden font-mono sm:inline-flex">
                  Run Summary
                </Badge>
                <span className="hidden font-mono text-sm text-muted-foreground sm:inline">
                  {deployDurationMs !== null ? formatDuration(deployDurationMs) : "—"}
                </span>
                {deployment.artifactKey ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-sky-500 text-white">
                    <Check className="size-4" />
                  </span>
                ) : (
                  <Clock className="size-5 text-muted-foreground" />
                )}
              </>
            }
          >
            <Card className="gap-0 py-0">
              <div className="space-y-1 rounded-md bg-black p-3 font-mono text-xs leading-5 text-white/80">
                <p>
                  <span className="text-white/40">[{createdLabel}]</span> Upload received:{" "}
                  {files.length} file{files.length === 1 ? "" : "s"} ({formatBytes(totalBytes)})
                </p>
                <p>
                  <span className="text-white/40">[{createdLabel}]</span> Entrypoint: {deployment.entrypoint}
                </p>
                <p>
                  <span className="text-white/40">[{createdLabel}]</span> Routed to node{" "}
                  {shortId(deployment.machineId)}
                </p>
                {deployment.artifactKey ? (
                  <p className="text-emerald-300">✓ Build finished — wasm artifact stored</p>
                ) : (
                  <p className="text-amber-300">○ Build pending — no artifact yet</p>
                )}
                {deployment.artifactKey && (
                  <p className="break-all text-white/50">artifacts: {deployment.artifactKey}</p>
                )}
              </div>
              <div className="flex items-center gap-2 px-4 py-3 text-sm">
                <StatusDot status={deployment.status} />
                <span className="font-medium">{deploymentLabel(deployment.status)}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {deployment.updatedAt ? timeAgo(deployment.updatedAt) : timeAgo(deployment.createdAt)}
                </span>
              </div>
            </Card>
          </Section>

          <Section
            title="Deployment Summary"
            right={
              <>
                <Badge variant="outline" className="hidden font-mono sm:inline-flex">
                  Resources
                </Badge>
                <span className="flex size-6 items-center justify-center rounded-full bg-sky-500 text-white">
                  <Check className="size-4" />
                </span>
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="gap-1 px-4 py-3">
                <p className="text-xs text-muted-foreground">Invocations</p>
                <p className="text-lg font-semibold">{related.length}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {failed} failed
                </p>
              </Card>
              <Card className="gap-1 px-4 py-3">
                <p className="text-xs text-muted-foreground">Avg duration</p>
                <p className="text-lg font-semibold">
                  {avgDuration !== null ? formatDuration(avgDuration) : "—"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">last {related.length} runs</p>
              </Card>
              <Card className="gap-1 px-4 py-3">
                <p className="text-xs text-muted-foreground">Bundle</p>
                <p className="text-lg font-semibold">{formatBytes(totalBytes)}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {files.length} files
                </p>
              </Card>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openUrl(workerUrl)}>
                <Globe />
                {deployment.workerName}.hypercore
              </Button>
              <Button size="sm" variant="outline" onClick={() => void copy("summary", invokeUrl)}>
                {copied === "summary" ? <Check /> : <Copy />}
                Copy invoke URL
              </Button>
            </div>
          </Section>

          <Section
            title="Deployment Checks"
            right={
              related.length === 0 ? (
                <Clock className="size-5 text-muted-foreground" />
              ) : failed === 0 ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-4" />
                </span>
              ) : (
                <Badge variant="danger">{failed} failing</Badge>
              )
            }
          >
            {related.length === 0 ? (
              <Card className="px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  No invocations yet — hit the invoke URL to run a first check.
                </p>
              </Card>
            ) : (
              <Card className="gap-0 overflow-hidden py-0">
                <ul className="divide-y">
                  {related.slice(0, 5).map((inv) => (
                    <li key={inv.invocationId} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <StatusDot status={inv.status === "done" ? "built" : inv.status} />
                      <span className="font-mono text-[13px] font-medium">{inv.method}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted-foreground">
                        {inv.workerName}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDuration(inv.durationMs)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <div className="px-4 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-0"
                    onClick={() => onViewLogs?.(deployment.deploymentId)}
                  >
                    View all {related.length} logs
                    <ChevronRight />
                  </Button>
                </div>
              </Card>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function DeploymentDetailsPanel(props: DeploymentDetailsProps) {
  return (
    <Card className="flex min-h-0 w-[720px] max-w-[62%] shrink-0 flex-col gap-0 overflow-hidden py-0">
      <DeploymentDetailsContent {...props} />
    </Card>
  );
}

export function DeploymentDetailsSheet({
  open,
  ...props
}: DeploymentDetailsProps & { open: boolean }) {
  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose?.();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[720px] max-w-[95vw] gap-0 p-0 sm:max-w-[720px]"
      >
        <DeploymentDetailsContent {...props} />
      </SheetContent>
    </Sheet>
  );
}
