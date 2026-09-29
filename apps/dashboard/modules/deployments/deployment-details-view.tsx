"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import {
  fetchMyDeployments,
  fetchMyInvocations,
  type Deployment,
  type Invocation,
} from "@/lib/api";
import { DeploymentDetailsContent } from "./components/deployment-details-panel";

export function DeploymentDetailsView({ deploymentId }: { deploymentId: string }) {
  const router = useRouter();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [deps, invs] = await Promise.all([
        fetchMyDeployments(),
        fetchMyInvocations(),
      ]);
      setDeployments(deps);
      setInvocations(invs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [deploymentId]);

  const deployment = useMemo(
    () => deployments.find((d) => d.deploymentId === deploymentId),
    [deployments, deploymentId],
  );

  const isCurrent = useMemo(() => {
    if (!deployment) return false;
    const latestForWorker = deployments
      .filter((d) => d.workerName === deployment.workerName)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return latestForWorker?.deploymentId === deployment.deploymentId;
  }, [deployments, deployment]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <p className="text-sm text-muted-foreground">Loading deployment…</p>
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start gap-4 overflow-hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/deployments">
            <ArrowLeft />
            Back to deployments
          </Link>
        </Button>
        <Card className="w-full p-8 text-center">
          <p className="text-sm font-medium">Deployment not found</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{deploymentId}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refresh()}>
            <RefreshCw />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/deployments">
            <ArrowLeft />
            Deployments
          </Link>
        </Button>
        <span className="truncate font-mono text-sm text-muted-foreground">
          / {deployment.workerName} / {deployment.deploymentId.slice(0, 8)}
        </span>
      </div>

      {/* Same UI as the side panel, but as a full page card with internal scroll */}
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <DeploymentDetailsContent
          deployment={deployment}
          invocations={invocations}
          isCurrent={isCurrent}
          onBack={() => router.push("/deployments")}
          onViewLogs={(id) => router.push(`/logs?deployment=${encodeURIComponent(id)}`)}
        />
      </Card>
    </div>
  );
}
