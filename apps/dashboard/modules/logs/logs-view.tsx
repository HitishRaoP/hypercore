"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
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
import { fetchMyDeployments, fetchMyInvocations, type Deployment, type Invocation } from "@/lib/api";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatDuration, invocationTone } from "@/lib/format";
import { LogDetailPanel, LogDetailSheet } from "./components/log-detail-panel";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
const STATUSES = ["running", "done", "failed", "timeout"] as const;

export function LogsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deploymentParam = searchParams.get("deployment");
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [deploymentId, setDeploymentId] = useState("all");
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wide = useMediaQuery("(min-width: 1280px)");

  // Deep-link from deployment details (/logs?deployment=<id>) seeds the filter.
  useEffect(() => {
    setDeploymentId(deploymentParam ?? "all");
  }, [deploymentParam]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [invs, deps] = await Promise.all([fetchMyInvocations(), fetchMyDeployments()]);
      setInvocations(invs);
      setDeployments(deps);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const methodOptions = useMemo(() => {
    const fromData = new Set(invocations.map((inv) => inv.method));
    const extras = [...fromData].filter((m) => !(METHODS as readonly string[]).includes(m));
    return [...METHODS, ...extras];
  }, [invocations]);

  const statusOptions = useMemo(() => {
    const fromData = new Set(invocations.map((inv) => inv.status));
    const extras = [...fromData].filter((s) => !(STATUSES as readonly string[]).includes(s));
    return [...STATUSES, ...extras];
  }, [invocations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invocations.filter((inv) => {
      if (deploymentId !== "all" && inv.deploymentId !== deploymentId) return false;
      if (method !== "all" && inv.method !== method) return false;
      if (status !== "all" && inv.status !== status) return false;
      if (failedOnly && inv.status !== "failed" && inv.status !== "timeout") return false;
      if (!q) return true;
      const hay = `${inv.path} ${inv.workerName} ${inv.method} ${inv.stdoutPreview ?? ""} ${inv.error ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [invocations, query, deploymentId, method, status, failedOnly]);

  const hasActiveFilters =
    query.trim() !== "" || method !== "all" || status !== "all" || deploymentId !== "all" || failedOnly;

  const clearFilters = () => {
    setQuery("");
    setMethod("all");
    setStatus("all");
    setFailedOnly(false);
    setSelectedId(null);
    setDeploymentId("all");
    router.replace("/logs");
  };

  const handleDeploymentChange = (value: string) => {
    setDeploymentId(value);
    setSelectedId(null);
    router.replace(value === "all" ? "/logs" : `/logs?deployment=${encodeURIComponent(value)}`);
  };

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
            Invocation history for your deployed functions. Select a row for details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
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
        <Select value={deploymentId} onValueChange={handleDeploymentChange}>
          <SelectTrigger
            size="sm"
            className="w-56 min-w-0 shrink-0 overflow-hidden [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate"
          >
            <SelectValue placeholder="Deployment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All deployments</SelectItem>
            {deployments.map((d) => (
              <SelectItem key={d.deploymentId} value={d.deploymentId}>
                {d.workerName} · {d.deploymentId.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger size="sm" className="w-32 shrink-0">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {methodOptions.map((m) => (
              <SelectItem key={m} value={m} className="font-mono">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="w-32 shrink-0">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal has-checked:border-primary">
          <Checkbox checked={failedOnly} onCheckedChange={(v) => setFailedOnly(v === true)} />
          Failed only
        </Label>
      </div>

      {/* Same-viewport split: table scrolls left, detail panel scrolls right, page never scrolls */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="pl-6">Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead className="pr-6">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      {loading
                        ? "Loading logs…"
                        : invocations.length === 0
                          ? "No logs yet — invoke a function to see one land here."
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
                          <TableCell className="pl-6 font-mono text-sm whitespace-nowrap text-muted-foreground">
                            {new Date(inv.startedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              <Badge variant="outline" className="font-mono">
                                {inv.method}
                              </Badge>
                              <Badge variant={invocationTone(inv.status)} className="capitalize">
                                {inv.status}
                              </Badge>
                            </span>
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-sm">
                            {inv.workerName}
                          </TableCell>
                          <TableCell className="max-w-56 truncate font-mono text-sm">
                            {inv.path}
                          </TableCell>
                          <TableCell className="max-w-72 truncate pr-6 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="truncate">{detail ?? "—"}</span>
                              {detail && (
                                <ChevronDown
                                  className={`size-3.5 shrink-0 transition-transform ${isSelected ? "rotate-180" : ""}`}
                                />
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                        {isSelected && detail && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={5} className="px-6 py-3 whitespace-normal">
                              <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-muted-foreground">
                                <span>worker {inv.workerName}</span>
                                <span>duration {formatDuration(inv.durationMs)}</span>
                                {inv.exitCode !== null && inv.exitCode !== undefined && (
                                  <span>exit {inv.exitCode}</span>
                                )}
                              </div>
                              <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-background px-3 py-2 font-mono text-sm leading-5 whitespace-pre-wrap">
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
            <p className="font-mono text-sm text-muted-foreground uppercase">
              {filtered.length} of {invocations.length} logs
            </p>
          </div>
        </Card>

        {selected && wide && (
          <LogDetailPanel
            invocation={selected}
            deployment={selectedDeployment}
            onClose={() => setSelectedId(null)}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex < filtered.length - 1}
          />
        )}
      </div>

      {selected && !wide && (
        <LogDetailSheet
          open
          invocation={selected}
          deployment={selectedDeployment}
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
