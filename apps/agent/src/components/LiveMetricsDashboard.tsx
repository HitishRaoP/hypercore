import { Activity, Boxes, MemoryStick, Server } from "lucide-react";
import type { MetricsTick, RegistrationResponse } from "../types";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
const replicas = [
  {
    name: "edge-router",
    id: "wasm_4d1a9e",
    state: "Running",
    uptime: "02:14:32",
  },
  {
    name: "image-resizer",
    id: "wasm_09ab4f",
    state: "Running",
    uptime: "01:38:05",
  },
  {
    name: "event-consumer",
    id: "wasm_b8731c",
    state: "Standby",
    uptime: "00:42:18",
  },
];
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
  registration,
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
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-100">
              Active replicas
            </h3>
          </div>
          <span className="font-mono text-xs text-zinc-600">
            {registration.assignedRegion}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-600">
              <tr>
                <th className="px-5 py-3 font-medium">Deployment</th>
                <th className="px-5 py-3 font-medium">Replica ID</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {replicas.map((replica) => (
                <tr key={replica.id} className="text-zinc-400">
                  <td className="px-5 py-4 font-medium text-zinc-200">
                    <span className="mr-2 inline-grid size-5 place-items-center rounded bg-zinc-900">
                      <Server className="size-3 text-zinc-500" />
                    </span>
                    {replica.name}
                  </td>
                  <td className="px-5 py-4 font-mono text-zinc-500">
                    {replica.id}
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      className={
                        replica.state === "Running"
                          ? "border-emerald-900/70 text-emerald-400"
                          : "border-amber-900/70 text-amber-400"
                      }
                    >
                      <i
                        className={`size-1.5 rounded-full ${replica.state === "Running" ? "bg-emerald-400" : "bg-amber-400"}`}
                      />
                      {replica.state}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 font-mono text-zinc-500">
                    {replica.uptime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
