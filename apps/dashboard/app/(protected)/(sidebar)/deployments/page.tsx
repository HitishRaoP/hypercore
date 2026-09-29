"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hypercore/ui/components/table";
import { fetchMyDeployments, type Deployment } from "@/lib/api";

export default function Page() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setDeployments(await fetchMyDeployments());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Deployments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Functions you have deployed to the HyperCore network.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/create">New deployment</Link>
          </Button>
        </div>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="pl-6">Worker</TableHead>
                <TableHead>Deployment</TableHead>
                <TableHead>Node</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {loading ? "Loading deployments…" : "No deployments yet — create your first function."}
                  </TableCell>
                </TableRow>
              ) : (
                deployments.map((d) => (
                  <TableRow key={d.deploymentId}>
                    <TableCell className="max-w-48 truncate pl-6 font-medium">
                      {d.workerName}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {d.deploymentId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {d.machineId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.status}</Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right text-sm text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="shrink-0 border-t bg-muted/40 px-6 py-3">
          <p className="font-mono text-sm text-muted-foreground uppercase">
            {deployments.length} deployment{deployments.length === 1 ? "" : "s"}
          </p>
        </div>
      </Card>
    </div>
  );
}
