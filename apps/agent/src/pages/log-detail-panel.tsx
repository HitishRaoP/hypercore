import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Separator } from "@hypercore/ui/components/separator";
import {
  Sheet,
  SheetContent,
} from "@hypercore/ui/components/sheet";
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
import { useState } from "react";
import {
  deploymentVariant,
  formatDuration,
  formatLogTime,
  invocationVariant,
  shortId,
  timeAgo,
} from "../lib/activity";
import type { ActivityDeployment, ActivityInvocation } from "../types";

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
      <span className={cn("min-w-0 text-right", mono && "truncate font-mono text-sm")}>
        {children}
      </span>
    </div>
  );
}

export type LogDetailProps = {
  invocation: ActivityInvocation;
  deployment: ActivityDeployment | undefined;
  host: string;
  hostname: string;
  machineId: string;
  region: string;
  nodeId: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
};

function LogDetailContent({
  invocation,
  deployment,
  host,
  hostname,
  machineId,
  region,
  nodeId,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: LogDetailProps) {
  const [copied, setCopied] = useState(false);

  const copySummary = async () => {
    const summary = [
      `${invocation.method} ${invocation.path} — ${invocation.status}`,
      `Time: ${invocation.startedAt}`,
      `Request ID: ${invocation.invocationId}`,
      `Host: ${host}`,
      `Worker: ${invocation.workerName}`,
      `Duration: ${formatDuration(invocation.durationMs)}`,
      invocation.exitCode !== null && invocation.exitCode !== undefined
        ? `Exit code: ${invocation.exitCode}`
        : null,
      deployment ? `Deployment: ${deployment.deploymentId}` : null,
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
      <div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-3">
        <Badge variant="outline" className="shrink-0 font-mono">
          {invocation.method}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {invocation.path}
        </span>
        <Badge variant={invocationVariant(invocation.status)} className="shrink-0">
          {invocation.status === "running" ? "Running" : invocation.status}
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

      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-1.5 shrink-0 rounded-full border-2 border-muted-foreground" />
          <span className="font-medium">Request started</span>
          <span className="ml-auto font-mono text-sm text-muted-foreground">
            {formatLogTime(invocation.startedAt)}
          </span>
        </div>

        <Card className="gap-0 py-0">
          <div className="divide-y px-4 py-3">
            <KV label="Request ID" mono>
              {shortId(invocation.invocationId)}
            </KV>
            <KV label="Path" mono>
              {invocation.path}
            </KV>
            <KV label="Host" mono>
              {host}
            </KV>
            <KV label="Worker" mono>
              {invocation.workerName}
            </KV>
          </div>
        </Card>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          <span>
            Received by {hostname} ({shortId(machineId)})
          </span>
        </div>

        <Card className="gap-0 py-0">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <FunctionSquare className="size-4 text-muted-foreground" />
            Function Invocation
          </div>
          <div className="divide-y px-4 py-3">
            <KV label="Route" mono>
              {invocation.path}
            </KV>
            <KV label="Execution Duration" mono>
              {formatDuration(invocation.durationMs)}
            </KV>
            {invocation.exitCode !== null && invocation.exitCode !== undefined && (
              <KV label="Exit code" mono>
                {String(invocation.exitCode)}
              </KV>
            )}
            <KV label="Deployment" mono>
              {deployment ? shortId(deployment.deploymentId) : "—"}
            </KV>
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
                <span className="font-medium text-[var(--status-danger)]">
                  {invocation.status === "timeout" ? "Timed out" : "Failed"}
                </span>
              </>
            )}
          </div>
        </Card>

        <div>
          <h3 className="text-sm font-medium">Deployment Information</h3>
          <Card className="mt-2 gap-0 py-0">
            <div className="divide-y px-4 py-3">
              <KV label="Deployment ID" mono>
                {deployment ? shortId(deployment.deploymentId) : shortId(invocation.deploymentId)}
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
                  <Badge variant={deploymentVariant(deployment.status)}>
                    {deployment.status}
                  </Badge>
                </div>
              )}
              <KV label="Region">{region}</KV>
              <KV label="Node" mono>
                {nodeId}
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
    <Card className="flex w-[400px] max-w-[45%] shrink-0 flex-col gap-0 overflow-hidden py-0">
      <LogDetailContent {...props} />
    </Card>
  );
}

export function LogDetailSheet({
  open,
  ...props
}: LogDetailProps & { open: boolean }) {
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
