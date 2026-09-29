import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@hypercore/ui/components/card";
import { Separator } from "@hypercore/ui/components/separator";
import {
  ChevronDown,
  Package,
  Radio,
  RefreshCw,
  Terminal,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  ActivityDeployment,
  ActivityInvocation,
  ActivityResponse,
  DeploymentStatus,
  InvocationStatus,
} from "../types";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function invocationVariant(status: InvocationStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case "running":
      return "default";
    case "failed":
    case "timeout":
      return "destructive";
    case "done":
    default:
      return "secondary";
  }
}

function deploymentVariant(status: DeploymentStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "building":
    case "routed":
      return "default";
    case "failed":
      return "destructive";
    case "uploaded":
    case "offline":
      return "outline";
    case "built":
    default:
      return "secondary";
  }
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Zap }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InvocationRow({ invocation }: { invocation: ActivityInvocation }) {
  const [open, setOpen] = useState(false);
  const running = invocation.status === "running";
  const detail = invocation.error ?? invocation.stdoutPreview;
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => detail && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-6 py-3 text-left text-sm transition-colors ${detail ? "hover:bg-muted/50" : ""}`}
      >
        <Badge variant="outline" className="shrink-0 font-mono">
          {invocation.method}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{invocation.path}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{invocation.workerName}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatDuration(invocation.durationMs)}</span>
        <Badge variant={invocationVariant(invocation.status)} className="hidden shrink-0 md:inline-flex">
          {running ? "Running" : invocation.status}
        </Badge>
        <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground md:inline">{timeAgo(invocation.startedAt)}</span>
        {detail && (
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && detail && (
        <pre className="mx-6 mb-3 overflow-x-auto rounded-lg border bg-muted px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
          {detail}
        </pre>
      )}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: ActivityDeployment }) {
  return (
    <div className="flex items-center gap-3 border-b px-6 py-3 text-sm last:border-0">
      <span className="min-w-0 flex-1 truncate font-medium">{deployment.workerName}</span>
      <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline" title={deployment.deploymentId}>
        {shortId(deployment.deploymentId)}
      </span>
      <span className="hidden shrink-0 font-mono text-xs text-muted-foreground lg:inline">{deployment.entrypoint}</span>
      <Badge variant={deploymentVariant(deployment.status)} className="shrink-0">
        {deployment.status}
      </Badge>
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground md:inline">{timeAgo(deployment.createdAt)}</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof Radio;
  title: string;
  count?: number;
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="px-6 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" />
          {title}
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {count} live
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="px-0">
        {empty ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityView({
  coordinatorUrl,
  machineId,
}: {
  coordinatorUrl: string;
  machineId: string;
}) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${coordinatorUrl.replace(/\/+$/, "")}/activity?machineId=${encodeURIComponent(machineId)}&limit=50`,
      );
      if (!res.ok) throw new Error(`Coordinator responded ${res.status}`);
      setData(await res.json());
      setUpdatedAt(Date.now());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach coordinator.");
    }
  }, [coordinatorUrl, machineId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setSpinning(true);
    try {
      await load();
    } finally {
      setSpinning(false);
    }
  };

  const running = data?.invocations.filter((i) => i.status === "running") ?? [];
  const past = data?.invocations.filter((i) => i.status !== "running") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Live activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `Via ${data.source} · updated ${updatedAt ? timeAgo(new Date(updatedAt).toISOString()) : "—"}` : "Connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => void refresh()} title="Refresh now">
            <RefreshCw className={spinning ? "animate-spin" : ""} />
          </Button>
          <Badge variant={data?.online ? "default" : "secondary"}>
            {data?.online ? "Node online" : "Node offline"}
          </Badge>
        </div>
      </div>

      {error && !data ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">Could not reach the coordinator</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Executing now" value={running.length} icon={Zap} />
            <Stat label="Requests served" value={data?.invocations.length ?? 0} icon={Terminal} />
            <Stat label="Deployments" value={data?.deployments.length ?? 0} icon={Package} />
          </div>

          <SectionCard
            icon={Radio}
            title="Executing now"
            count={running.length}
            empty={running.length === 0 ? "Idle — URL hits will appear here the moment they execute." : undefined}
          >
            {running.map((invocation) => (
              <InvocationRow key={invocation.invocationId} invocation={invocation} />
            ))}
          </SectionCard>

          <SectionCard
            icon={Terminal}
            title="Recent requests"
            empty={past.length === 0 ? "No requests yet — hit your function URL to see one land here." : undefined}
          >
            {past.map((invocation) => (
              <InvocationRow key={invocation.invocationId} invocation={invocation} />
            ))}
          </SectionCard>

          <SectionCard
            icon={Package}
            title="Deployments"
            empty={(data?.deployments.length ?? 0) === 0 ? "No deployments routed to this node yet." : undefined}
          >
            {data?.deployments.map((deployment) => (
              <DeploymentRow key={deployment.deploymentId} deployment={deployment} />
            ))}
          </SectionCard>
        </>
      )}
    </div>
  );
}
