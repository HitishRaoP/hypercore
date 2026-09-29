"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hypercore/ui/components/table";
import { fetchMyInvocations, type Invocation } from "@/lib/api";

export default function Page() {
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      setInvocations(await fetchMyInvocations());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invocations;
    return invocations.filter((inv) =>
      `${inv.path} ${inv.workerName} ${inv.method} ${inv.status} ${inv.stdoutPreview ?? ""} ${inv.error ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [invocations, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invocation history for your deployed functions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search logs…"
          className="pl-9"
        />
      </div>
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
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
                    {loading ? "Loading logs…" : "No logs yet — invoke a function to see one land here."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.invocationId}>
                    <TableCell className="pl-6 font-mono text-sm whitespace-nowrap text-muted-foreground">
                      {new Date(inv.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline" className="font-mono">
                          {inv.method}
                        </Badge>
                        <Badge variant="secondary">{inv.status}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm">
                      {inv.workerName}
                    </TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-sm">
                      {inv.path}
                    </TableCell>
                    <TableCell className="max-w-72 truncate pr-6 text-sm text-muted-foreground">
                      {inv.error ?? inv.stdoutPreview ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
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
    </div>
  );
}
