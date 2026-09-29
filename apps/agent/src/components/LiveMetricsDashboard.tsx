import { Badge } from "@hypercore/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@hypercore/ui/components/card";
import { Activity, MemoryStick } from "lucide-react";
import type { MetricsTick, RegistrationResponse } from "../types";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Node dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live runtime telemetry and replica execution.
          </p>
        </div>
        <Badge>
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Node online
        </Badge>
      </div>
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
          detail={`${(metrics.usedMemoryMb / 1024).toFixed(1)} GB / ${(metrics.totalMemoryMb / 1024).toFixed(1)} GB`}
          icon={MemoryStick}
        />
      </div>
    </div>
  );
}
