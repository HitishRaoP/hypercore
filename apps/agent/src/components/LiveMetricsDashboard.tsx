import { Activity, MemoryStick } from "lucide-react";
import type { MetricsTick, RegistrationResponse } from "../types";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

function Gauge({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="mt-2 font-mono text-3xl font-medium tracking-tight text-zinc-100">
            {value.toFixed(1)}
            <span className="ml-1 text-sm text-zinc-500">%</span>
          </p>
        </div>
        <Icon className="size-4 text-zinc-500" />
      </div>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-600">{detail}</p>
    </Card>
  );
}
export function LiveMetricsDashboard({
  metrics,
}: {
  metrics: MetricsTick;
  registration: RegistrationResponse;
}) {
  const ram = metrics.totalMemoryMb
    ? (metrics.usedMemoryMb / metrics.totalMemoryMb) * 100
    : 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-zinc-100">Node dashboard</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Live runtime telemetry and replica execution.
          </p>
        </div>
        <Badge className="border-emerald-900/70 bg-emerald-950/30 text-emerald-400">
          <i className="size-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
          Node Online &amp; Accepting Workloads
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Gauge
          label="CPU utilization"
          value={metrics.cpuPercent}
          detail="Refreshed every 2 seconds"
          icon={Activity}
          color="bg-emerald-500"
        />
        <Gauge
          label="Memory utilization"
          value={ram}
          detail={`${(metrics.usedMemoryMb / 1024).toFixed(1)} GB / ${(metrics.totalMemoryMb / 1024).toFixed(1)} GB`}
          icon={MemoryStick}
          color="bg-amber-500"
        />
      </div>
    </div>
  );
}
