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
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

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

const METHOD_STYLES: Record<string, string> = {
  GET: "border-emerald-900/70 bg-emerald-950/30 text-emerald-400",
  POST: "border-sky-900/70 bg-sky-950/30 text-sky-400",
  PUT: "border-amber-900/70 bg-amber-950/30 text-amber-400",
  DELETE: "border-rose-900/70 bg-rose-950/30 text-rose-400",
};

const INVOCATION_DOT: Record<InvocationStatus, string> = {
  running: "bg-sky-400 shadow-[0_0_8px_#38bdf8]",
  done: "bg-emerald-400",
  failed: "bg-rose-400",
  timeout: "bg-amber-400",
};

const DEPLOYMENT_DOT: Record<DeploymentStatus, string> = {
  uploaded: "bg-zinc-400",
  routed: "bg-sky-400",
  offline: "bg-zinc-500",
  building: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
  built: "bg-emerald-400",
  failed: "bg-rose-400",
};

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Zap }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 text-zinc-500" />
      <div>
        <p className="font-mono text-xl font-medium leading-none text-zinc-100">{value}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{label}</p>
      </div>
    </Card>
  );
}

function InvocationRow({ invocation }: { invocation: ActivityInvocation }) {
  const [open, setOpen] = useState(false);
  const running = invocation.status === "running";
  const detail = invocation.error ?? invocation.stdoutPreview;
  return (
    <div className="border-b border-zinc-900 last:border-0">
      <button
        onClick={() => detail && setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left text-xs transition-colors ${detail ? "hover:bg-zinc-900/40" : ""}`}
      >
        <i className={`size-1.5 shrink-0 rounded-full ${INVOCATION_DOT[invocation.status]} ${running ? "animate-pulse" : ""}`} />
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${METHOD_STYLES[invocation.method] ?? "border-zinc-800 text-zinc-400"}`}
        >
          {invocation.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{invocation.path}</span>
        <span className="hidden shrink-0 font-mono text-zinc-600 sm:inline">{invocation.workerName}</span>
        <span className="shrink-0 font-mono text-zinc-500">{formatDuration(invocation.durationMs)}</span>
        <span className="hidden w-16 shrink-0 text-right text-zinc-600 md:inline">{timeAgo(invocation.startedAt)}</span>
        {detail && (
          <ChevronDown className={`size-3.5 shrink-0 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && detail && (
        <pre className="mx-5 mb-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-900 bg-black px-3 py-2 font-mono text-[11px] leading-5 text-zinc-400">
          {detail}
        </pre>
      )}
    </div>
  );
}

function DeploymentRow({ deployment }: { deployment: ActivityDeployment }) {
  const active = deployment.status === "building" || deployment.status === "routed";
  return (
    <div className="flex items-center gap-3 border-b border-zinc-900 px-5 py-3 text-xs last:border-0">
      <i className={`size-1.5 shrink-0 rounded-full ${DEPLOYMENT_DOT[deployment.status]} ${active ? "animate-pulse" : ""}`} />
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">{deployment.workerName}</span>
      <span className="hidden shrink-0 font-mono text-zinc-600 sm:inline" title={deployment.deploymentId}>
        {shortId(deployment.deploymentId)}
      </span>
      <span className="shrink-0 font-mono text-zinc-500">{deployment.entrypoint}</span>
      <Badge className="shrink-0 border-zinc-800 text-zinc-400">{deployment.status}</Badge>
      <span className="hidden w-16 shrink-0 text-right text-zinc-600 md:inline">{timeAgo(deployment.createdAt)}</span>
    </div>
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">Live activity</h2>
          <p className="mt-1 font-mono text-[11px] text-zinc-600">
            {data ? `via ${data.source} · updated ${updatedAt ? timeAgo(new Date(updatedAt).toISOString()) : "—"}` : "connecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="grid size-7 place-items-center rounded-md border border-zinc-800 text-zinc-500 transition-colors hover:text-zinc-200"
            title="Refresh now"
          >
            <RefreshCw className={`size-3.5 ${spinning ? "animate-spin" : ""}`} />
          </button>
          <Badge className={data?.online ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-400" : "border-zinc-800 text-zinc-500"}>
            <i className={`size-1.5 rounded-full ${data?.online ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_#10b981]" : "bg-zinc-600"}`} />
            {data?.online ? "Node online" : "Node offline"}
          </Badge>
        </div>
      </div>

      {error && !data ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-zinc-400">Could not reach the coordinator</p>
          <p className="mt-1 font-mono text-xs text-zinc-600">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-4 rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            Retry
          </button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Executing now" value={running.length} icon={Zap} />
            <Stat label="Requests served" value={data?.invocations.length ?? 0} icon={Terminal} />
            <Stat label="Deployments" value={data?.deployments.length ?? 0} icon={Package} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <Radio className="size-3.5 text-zinc-500" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">Executing now</h3>
              {running.length > 0 && (
                <span className="font-mono text-[11px] text-sky-400">{running.length} live</span>
              )}
            </div>
            {running.length === 0 ? (
              <p className="px-5 py-4 text-xs text-zinc-600">Idle — URL hits will appear here the moment they execute.</p>
            ) : (
              running.map((invocation) => (
                <InvocationRow key={invocation.invocationId} invocation={invocation} />
              ))
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <Terminal className="size-3.5 text-zinc-500" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">Recent requests</h3>
            </div>
            {past.length === 0 ? (
              <p className="px-5 py-4 text-xs text-zinc-600">No requests yet — hit your function URL to see one land here.</p>
            ) : (
              past.map((invocation) => (
                <InvocationRow key={invocation.invocationId} invocation={invocation} />
              ))
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <Package className="size-3.5 text-zinc-500" />
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">Deployments</h3>
            </div>
            {(data?.deployments.length ?? 0) === 0 ? (
              <p className="px-5 py-4 text-xs text-zinc-600">No deployments routed to this node yet.</p>
            ) : (
              data?.deployments.map((deployment) => (
                <DeploymentRow key={deployment.deploymentId} deployment={deployment} />
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}
