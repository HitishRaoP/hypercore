"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@hypercore/ui/components/card";
import { fetchNodes, type MachineNode } from "@/lib/api";

function gb(mb: number) {
  return `${(mb / 1024).toFixed(1)} GB`;
}

function MachineCard({ node }: { node: MachineNode }) {
  const memUsedPct = node.totalMemoryMb
    ? Math.round((node.usedMemoryMb / node.totalMemoryMb) * 100)
    : 0;
  const diskUsedPct = node.totalDiskMb
    ? Math.round(
        ((node.totalDiskMb - node.availableDiskMb) / node.totalDiskMb) * 100,
      )
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{node.hostname}</CardTitle>
            <CardDescription className="truncate font-mono">
              {node.machineId}
            </CardDescription>
          </div>
          <Badge variant={node.online ? "default" : "secondary"}>
            {node.online ? "Online" : "Offline"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="size-4" />
          <span className="truncate">
            {node.cpuBrand} · {node.cpuLogicalCores} threads
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MemoryStick className="size-4" />
          <span>
            {gb(node.usedMemoryMb)} / {gb(node.totalMemoryMb)} · {memUsedPct}%
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <HardDrive className="size-4" />
          <span>
            {gb(node.availableDiskMb)} free of {gb(node.totalDiskMb)} ·{" "}
            {diskUsedPct}% used
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {node.osName} {node.osVersion} · {node.arch} · {node.localIp}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const [nodes, setNodes] = useState<MachineNode[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setNodes(await fetchNodes());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const online = nodes.filter((n) => n.online).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Machines</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Discovering nodes…"
              : `${online} of ${nodes.length} nodes online in the HyperCore network.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      {nodes.length === 0 && !loading ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-sm font-medium">No machines registered yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Install the agent on a worker machine to see it here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {nodes.map((node) => (
            <MachineCard key={node.machineId} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
