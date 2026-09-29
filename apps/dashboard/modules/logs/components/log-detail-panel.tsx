"use client";

import { useState } from "react";
import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Separator } from "@hypercore/ui/components/separator";
import { Sheet, SheetContent } from "@hypercore/ui/components/sheet";
import { cn } from "@hypercore/ui/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FunctionSquare,
  Globe,
  X,
} from "lucide-react";
import type { Deployment, Invocation } from "@/lib/api";
import {
  deploymentLabel,
  deploymentTone,
  formatDuration,
  formatLogTime,
  invocationTone,
  shortId,
  timeAgo,
} from "@/lib/format";

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
    <div className="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right break-all",
          mono && "truncate font-mono text-[13px]",
        )}
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
    </div>
  );
}

export interface LogDetailProps {
  invocation: Invocation;
  deployment: Deployment | undefined;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

function LogDetailContent({
  invocation,
  deployment,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: LogDetailProps) {
  const [copied, setCopied] = useState(false);
  const detail = invocation.error ?? invocation.stdoutPreview;

  const copySummary = async () => {
    const summary = [
      `${invocation.method} — ${invocation.status}`,
      `Time: ${invocation.startedAt}`,
      `Request ID: ${invocation.invocationId}`,
      `Worker: ${invocation.workerName}`,
      `Deployment: ${invocation.deploymentId}`,
      `Duration: ${formatDuration(invocation.durationMs)}`,
      invocation.exitCode !== null && invocation.exitCode !== undefined
        ? `Exit code: ${invocation.exitCode}`
        : null,
      detail ? `Output: ${detail}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-3">
        <Badge variant="outline" className="shrink-0 font-mono">
          {invocation.method}
        </Badge>
        <span className="min-w-0 flex-1" />
        <Badge variant={invocationTone(invocation.status)} className="shrink-0 capitalize">
          {invocation.status}
        </Badge>
        <Button variant="ghost" size="icon-sm" onClick={onPrev} disabled={!hasPrev} title="Previous log">
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onNext} disabled={!hasNext} title="Next log">
          <ChevronDown />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void copySummary()} title="Copy details">
          {copied ? <Check /> : <Copy />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close details">
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Timeline marker */}
        <div className="flex items-center gap-2 text-sm">
          <span className="size-1.5 shrink-0 rounded-full border-2 border-muted-foreground" />
          <span className="font-medium">Request started</span>
          <span className="ml-auto font-mono text-[13px] text-muted-foreground">
            {formatLogTime(invocation.startedAt)}
          </span>
        </div>

        {/* Request */}
        <Card className="gap-0 py-0">
          <div className="divide-y px-4 py-3">
            <KV label="Request ID" mono>
              {shortId(invocation.invocationId)}
            </KV>
            <KV label="Method" mono>
              {invocation.method}
            </KV>
            <KV label="Worker" mono>
              {invocation.workerName}
            </KV>
          </div>
        </Card>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate">
            Served by node <span className="font-mono">{shortId(invocation.machineId)}</span>
          </span>
        </div>

        {/* Function invocation */}
        <Card className="gap-0 py-0">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <FunctionSquare className="size-4 text-muted-foreground" />
            Function Invocation
          </div>
          <div className="divide-y px-4 py-3">
            <KV label="Execution Duration" mono>
              {formatDuration(invocation.durationMs)}
            </KV>
            {invocation.exitCode !== null && invocation.exitCode !== undefined && (
              <KV label="Exit code" mono>
                {String(invocation.exitCode)}
              </KV>
            )}
            <KV label="Deployment" mono>
              {shortId(invocation.deploymentId)}
            </KV>
            {invocation.finishedAt && (
              <KV label="Finished" mono>
                {timeAgo(invocation.finishedAt)}
              </KV>
            )}
          </div>
          <Separator />
          <div className="flex items-center gap-2 px-4 py-3 text-sm">
            {invocation.status === "running" ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--status-info)]" />
                <span className="font-medium text-[var(--status-info)]">Running…</span>
              </>
            ) : invocation.status === "done" ? (
              <>
                <span className="size-1.5 rounded-full bg-[var(--status-success)]" />
                <span className="font-medium">
                  Response finished in {formatDuration(invocation.durationMs)}
                </span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-[var(--status-danger)]" />
                <span className="font-medium text-[var(--status-danger)] capitalize">
                  {invocation.status === "timeout" ? "Timed out" : "Failed"}
                </span>
              </>
            )}
          </div>
          {detail && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {invocation.error ? "Error" : "Output"}
                </p>
                <pre className="max-h-56 overflow-auto rounded-md border bg-background px-3 py-2 font-mono text-[13px] leading-5 whitespace-pre-wrap">
                  {detail}
                </pre>
              </div>
            </>
          )}
        </Card>

        {/* Deployment info */}
        <div>
          <h3 className="text-sm font-medium">Deployment Information</h3>
          <Card className="mt-2 gap-0 py-0">
            <div className="divide-y px-4 py-3">
              <KV label="Deployment ID" mono>
                {shortId(invocation.deploymentId)}
              </KV>
              <KV label="Worker" mono>
                {invocation.workerName}
              </KV>
              {deployment && (
                <KV label="Entrypoint" mono>
                  {deployment.entrypoint}
                </KV>
              )}
              {deployment && (
                <div className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="shrink-0 text-muted-foreground">Status</span>
                  <Badge variant={deploymentTone(deployment.status)}>
                    {deploymentLabel(deployment.status)}
                  </Badge>
                </div>
              )}
              <KV label="Node" mono>
                {shortId(invocation.machineId)}
              </KV>
              {deployment && (
                <KV label="Created" mono>
                  {timeAgo(deployment.createdAt)}
                </KV>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LogDetailPanel(props: LogDetailProps) {
  return (
    <Card className="flex max-w-[45%] min-h-0 w-[400px] shrink-0 flex-col gap-0 overflow-hidden py-0">
      <LogDetailContent {...props} />
    </Card>
  );
}

export function LogDetailSheet({ open, ...props }: LogDetailProps & { open: boolean }) {
  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose();
      }}
    >
      <SheetContent side="right" showCloseButton={false} className="w-[400px] max-w-[90vw] gap-0 p-0">
        <LogDetailContent {...props} />
      </SheetContent>
    </Sheet>
  );
}
