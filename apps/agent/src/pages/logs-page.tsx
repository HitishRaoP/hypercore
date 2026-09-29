import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Checkbox } from "@hypercore/ui/components/checkbox";
import { Input } from "@hypercore/ui/components/input";
import { Label } from "@hypercore/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hypercore/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hypercore/ui/components/table";
import { Pause, Play, RefreshCw, Search, ChevronDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  formatDuration,
  formatLogTime,
  invocationVariant,
  timeAgo,
} from "../lib/activity";
import type {
  ActivityDeployment,
  ActivityInvocation,
  InvocationStatus,
} from "../types";
import { LogDetailPanel, LogDetailSheet } from "./log-detail-panel";
import { useMediaQuery } from "../hooks/use-media-query";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
const STATUSES: InvocationStatus[] = ["running", "done", "failed", "timeout"];

function hostOf(coordinatorUrl: string): string {
  try {
    return new URL(coordinatorUrl).hostname;
  } catch {
    return coordinatorUrl;
  }
}

export function LogsPage({
  invocations,
  deployments,
  coordinatorUrl,
  hostname,
  machineId,
  region,
  nodeId,
  updatedAt,
  error,
  refreshing,
  onRefresh,
  live,
  onLiveChange,
  source,
  online,
}: {
  invocations: ActivityInvocation[];
  deployments: ActivityDeployment[];
  coordinatorUrl: string;
  hostname: string;
  machineId: string;
  region: string;
  nodeId: string;
  updatedAt: number | null;
  error: string;
  refreshing: boolean;
  onRefresh: () => void;
  live: boolean;
  onLiveChange: (live: boolean) => void;
  source: string | null;
  online: boolean;
}) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery("(min-width: 1280px)");
  const host = hostOf(coordinatorUrl);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invocations.filter((inv) => {
      if (method !== "all" && inv.method !== method) return false;
      if (status !== "all" && inv.status !== status) return false;
      if (failedOnly && inv.status !== "failed" && inv.status !== "timeout") return false;
      if (!q) return true;
      const hay = `${inv.path} ${inv.workerName} ${inv.method} ${inv.stdoutPreview ?? ""} ${inv.error ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [invocations, query, method, status, failedOnly]);

  const selectedIndex = selectedId
    ? filtered.findIndex((inv) => inv.invocationId === selectedId)
    : -1;
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : undefined;
  const selectedDeployment = selected
    ? deployments.find((d) => d.deploymentId === selected.deploymentId)
    : undefined;

  const step = (delta: 1 | -1) => {
    if (selectedIndex < 0) return;
    const next = filtered[selectedIndex + delta];
    if (next) setSelectedId(next.invocationId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {updatedAt
              ? `Via ${source ?? "coordinator"} · updated ${timeAgo(new Date(updatedAt).toISOString())}`
              : "Invocations served by this node."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "secondary"}>
            {online ? "Node online" : "Node offline"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => onLiveChange(!live)}>
            {live ? <Pause /> : <Play />}
            {live ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onRefresh} title="Refresh now">
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs…"
            className="pl-9"
          />
        </div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m} className="font-mono">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal has-checked:border-primary">
          <Checkbox checked={failedOnly} onCheckedChange={(v) => setFailedOnly(v === true)} />
          Failed only
        </Label>
      </div>

      {error && filtered.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <p className="text-sm font-medium">Could not reach the coordinator</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={onRefresh} className="mt-4">
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            <div className="scroll-thin table-scroll min-h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="pl-6">Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead className="pr-6">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                        {invocations.length === 0
                          ? "No logs yet — hit your function URL to see one land here."
                          : "No logs match the current filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((inv) => {
                      const detail = inv.error ?? inv.stdoutPreview;
                      const isSelected = inv.invocationId === selectedId;
                      return (
                        <Fragment key={inv.invocationId}>
                        <TableRow
                          data-state={isSelected ? "selected" : undefined}
                          onClick={() => setSelectedId(isSelected ? null : inv.invocationId)}
                          className="cursor-pointer"
                        >
                          <TableCell className="pl-6 font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {formatLogTime(inv.startedAt)}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              <Badge variant="outline" className="font-mono">
                                {inv.method}
                              </Badge>
                              <Badge variant={invocationVariant(inv.status)}>
                                {inv.status === "running" ? "Running" : inv.status}
                              </Badge>
                            </span>
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                            {host}
                          </TableCell>
                          <TableCell className="max-w-56 truncate font-mono text-xs">
                            {inv.path}
                          </TableCell>
                          <TableCell className="max-w-72 truncate pr-6 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="truncate">{detail ?? "—"}</span>
                              {detail && (
                                <ChevronDown className={`size-3.5 shrink-0 transition-transform ${isSelected ? "rotate-180" : ""}`} />
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                        {isSelected && detail && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={5} className="px-6 py-3 whitespace-normal">
                              <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
                                <span>worker {inv.workerName}</span>
                                <span>duration {formatDuration(inv.durationMs)}</span>
                                {inv.exitCode !== null && inv.exitCode !== undefined && (
                                  <span>exit {inv.exitCode}</span>
                                )}
                              </div>
                              <pre className="mt-2 overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap">
                                {detail}
                              </pre>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="shrink-0 border-t bg-muted/40 px-6 py-3">
              <p className="font-mono text-xs text-muted-foreground uppercase">
                {filtered.length} of {invocations.length} logs
              </p>
            </div>
          </Card>

          {selected && wide && (
            <LogDetailPanel
              invocation={selected}
              deployment={selectedDeployment}
              host={host}
              hostname={hostname}
              machineId={machineId}
              region={region}
              nodeId={nodeId}
              onClose={() => setSelectedId(null)}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex < filtered.length - 1}
            />
          )}
        </div>
      )}
      {selected && !wide && (
        <LogDetailSheet
          open
          invocation={selected}
          deployment={selectedDeployment}
          host={host}
          hostname={hostname}
          machineId={machineId}
          region={region}
          nodeId={nodeId}
          onClose={() => setSelectedId(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < filtered.length - 1}
        />
      )}
    </div>
  );
}
