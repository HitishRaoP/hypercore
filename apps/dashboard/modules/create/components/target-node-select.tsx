"use client";

import {
  Apple,
  AppWindow,
  LayoutGrid,
  RefreshCw,
  Server,
  Terminal,
} from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hypercore/ui/components/select";
import { cn } from "@hypercore/ui/lib/utils";
import type { MachineNode } from "../lib/deploy";

const isLegacyNode = (node: MachineNode) =>
  !node.hostname?.trim() || !node.osName?.trim();

export const OsIcon = ({ osName, className }: { osName?: string; className?: string }) => {
  const name = (osName ?? "").toLowerCase();
  const cls = cn("h-5 w-5 shrink-0", className);
  if (name.includes("window") || name.includes("win32") || name.includes("win64"))
    return <LayoutGrid className={cls} />;
  if (name.includes("mac") || name.includes("darwin") || name.includes("apple"))
    return <Apple className={cls} />;
  if (
    name.includes("linux") ||
    name.includes("ubuntu") ||
    name.includes("debian") ||
    name.includes("fedora")
  )
    return <Terminal className={cls} />;
  if (name) return <AppWindow className={cls} />;
  return <Server className={cls} />;
};

export const NodeSpecsLine = ({ node }: { node: MachineNode }) => {
  if (isLegacyNode(node)) {
    return (
      <span className="text-amber-700">
        Legacy agent — hardware details unavailable. Update the agent to report
        specs.
      </span>
    );
  }
  const parts = [
    [node.osName, node.osVersion].filter(Boolean).join(" "),
    node.arch,
    typeof node.cpuLogicalCores === "number" ? `${node.cpuLogicalCores} cores` : null,
    typeof node.totalMemoryMb === "number" ? `${node.totalMemoryMb} MB` : null,
  ].filter(Boolean);
  return <>{parts.join(" · ") || "Specs unavailable"}</>;
};

interface TargetNodeSelectProps {
  value: string;
  onChange: (machineId: string) => void;
  nodes: MachineNode[];
  loading: boolean;
  onRefresh: () => void;
}

export const TargetNodeSelect = ({
  value,
  onChange,
  nodes,
  loading,
  onRefresh,
}: TargetNodeSelectProps) => {
  const selected = nodes.find((node) => node.machineId === value);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange} disabled={loading || nodes.length === 0}>
          <SelectTrigger className="h-[45px] flex-1 rounded-xl font-mono text-sm">
            {selected ? (
              <span className="flex min-w-0 items-center gap-2.5">
                <OsIcon osName={selected.osName} />
                <span className="min-w-0 truncate text-left">
                  <span className="block truncate font-sans text-[15px] font-medium">
                    {selected.hostname || "Unnamed node"}
                  </span>
                </span>
                <span
                  className={cn(
                    "ml-auto h-2 w-2 shrink-0 rounded-full",
                    selected.online ? "bg-green-500" : "bg-zinc-300",
                  )}
                />
              </span>
            ) : (
              <SelectValue
                placeholder={
                  loading
                    ? "Loading nodes…"
                    : nodes.length
                      ? "Select a target node"
                      : "No nodes registered"
                }
              />
            )}
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[320px]">
            {nodes.map((node) => (
              <SelectItem key={node.machineId} value={node.machineId} className="py-2.5 pr-8">
                <span className="flex min-w-0 items-start gap-2.5">
                  <OsIcon osName={node.osName} className="mt-0.5 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-sans text-sm font-medium">
                        {node.hostname || "Unnamed node"}
                      </span>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          node.online ? "bg-green-500" : "bg-zinc-300",
                        )}
                      />
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {node.machineId}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <NodeSpecsLine node={node} />
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {node.online ? "Online" : "Offline — deploy will be stored"} ·{" "}
                      {node.cpuBrand || "CPU unknown"}
                    </span>
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="h-[45px] shrink-0 rounded-xl"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {loading
          ? "Loading registered nodes…"
          : nodes.length
            ? `${nodes.filter((n) => n.online).length} of ${nodes.length} node(s) online. Offline nodes still accept deploys — they are stored until the agent reconnects.`
            : "No nodes registered yet — start the HC Agent and register first."}
      </p>
    </div>
  );
};
