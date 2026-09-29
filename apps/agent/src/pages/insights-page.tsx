import { Badge } from "@hypercore/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hypercore/ui/components/card";
import { Activity, MemoryStick } from "lucide-react";
import type { MetricsTick, ToolchainStatus } from "../types";
import type { MachineInfo } from "../types";

function Gauge({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          {label}
          <Icon className="size-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value.toFixed(1)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

export function InsightsPage({
  metrics,
  info,
  toolchain,
  online,
}: {
  metrics: MetricsTick;
  info: MachineInfo | null;
  toolchain: ToolchainStatus | null;
  online: boolean;
}) {
  const ram = metrics.totalMemoryMb
    ? (metrics.usedMemoryMb / metrics.totalMemoryMb) * 100
    : 0;
  const capacity = info
    ? [
        { label: "Logical cores", value: String(info.cpuLogicalCores) },
        { label: "Physical cores", value: String(info.cpuPhysicalCores) },
        { label: "Total memory", value: gb(info.totalMemoryMb) },
        { label: "Free disk", value: gb(info.availableDiskMb) },
      ]
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Insights</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live runtime telemetry for this machine.
          </p>
        </div>
        <Badge variant={online ? "default" : "secondary"}>
          {online ? "Node online" : "Node offline"}
        </Badge>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto pb-1">
      <div className="grid gap-4 sm:grid-cols-2">
        <Gauge
          label="CPU utilization"
          value={metrics.cpuPercent}
          detail="Refreshed every 2 seconds"
          icon={Activity}
        />
        <Gauge
          label="Memory utilization"
          value={ram}
          detail={`${gb(metrics.usedMemoryMb)} / ${gb(metrics.totalMemoryMb)}`}
          icon={MemoryStick}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Capacity</CardTitle>
            <CardDescription>Provisioned hardware on this node.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {capacity.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-mono text-xs tabular-nums">{row.value}</dd>
                </div>
              ))}
              {capacity.length === 0 && (
                <p className="text-sm text-muted-foreground">No hardware probe yet.</p>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Toolchain</CardTitle>
            <CardDescription>Bundled build tools.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {(
                [
                  { label: "esbuild", value: toolchain?.esbuild },
                  { label: "javy", value: toolchain?.javy },
                ] as const
              ).map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <dt className="font-mono text-xs">{row.label}</dt>
                  <dd>
                    <Badge variant={row.value ? "secondary" : "outline"}>
                      {row.value ?? "missing"}
                    </Badge>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
