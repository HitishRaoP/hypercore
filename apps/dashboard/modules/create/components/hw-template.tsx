"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import {
  HELLO_WORLD_INDEX_TS,
  fetchNodes,
  helloWorldFiles,
  type DeployResultData,
  type MachineNode,
} from "../lib/deploy";
import { env } from "@/lib/env";
import { DeploySuccess } from "./deploy-success";
import { TargetNodeSelect } from "./target-node-select";
import { WorkerNameField, type WorkerNameStatus } from "./worker-name-field";

interface HWTemplateProps {
  onBack: () => void;
}

export const HWTemplate = ({ onBack }: HWTemplateProps) => {
  const [workerName, setWorkerName] = useState("long-poetry-3588");
  const [nameStatus, setNameStatus] = useState<WorkerNameStatus>("idle");
  const [machineId, setMachineId] = useState("");
  const [nodes, setNodes] = useState<MachineNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshNodes = async () => {
    setLoadingNodes(true);
    try {
      const online = await fetchNodes();
      setNodes(online);
      if (online[0]) setMachineId((prev) => prev || online[0]!.machineId);
    } finally {
      setLoadingNodes(false);
    }
  };

  useEffect(() => {
    void refreshNodes();
  }, []);

  const deploy = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      if (!machineId.trim()) throw new Error("Pick a target node.");
      const formData = new FormData();
      formData.append("workerName", workerName.trim() || "hello-world");
      formData.append("machineId", machineId.trim());
      formData.append("entrypoint", "index.ts");
      for (const file of helloWorldFiles()) formData.append("files", file, file.name);
      const res = await axios.post(`${env.API_URL}/code-upload`, formData, {
        withCredentials: true
      });
      setResult({
        status: res.data.status,
        deploymentId: res.data.deploymentId,
        workerName: res.data.workerName,
        machineId: res.data.machineId,
        entrypoint: res.data.entrypoint,
        files: res.data.files ?? [],
        invokeUrl: res.data.invokeUrl,
        workerUrl: res.data.workerUrl,
      });
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? ((e.response?.data?.error as string | undefined) ?? e.message)
          : e instanceof Error
            ? e.message
            : "Deploy failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <DeploySuccess
        result={result}
        onBack={onBack}
        onReset={() => setResult(null)}
      />
    );
  }

  return (
    <Card className="flex max-h-[calc(100vh-228px)] w-1/2 sm:w-2/3 md:w-full flex-col overflow-hidden pb-0">
      <CardHeader className="shrink-0">
        <h1 className="text-xl">Deploy Hello World</h1>
        <p className="text-sm text-muted-foreground">
          {"A simple Worker that returns 'Hello World!'. Perfect for getting started."}
        </p>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 space-y-5 overflow-y-auto pb-6">
        <WorkerNameField
          value={workerName}
          onChange={setWorkerName}
          onStatusChange={setNameStatus}
        />

        <div className="space-y-2">
          <label className="text-[16px] font-medium">Target node</label>
          <TargetNodeSelect
            value={machineId}
            onChange={setMachineId}
            nodes={nodes}
            loading={loadingNodes}
            onRefresh={() => void refreshNodes()}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[16px] font-medium">Bundle contents</label>
          <div className="overflow-hidden rounded-xl border border-[var(--ds-gray-400)] bg-[var(--ds-gray-100)] p-5">
            <pre className="overflow-x-auto whitespace-pre font-mono text-sm leading-6">
              <code>{HELLO_WORLD_INDEX_TS}</code>
            </pre>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className="m-0 flex shrink-0 items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={deploy}
          disabled={busy || nameStatus === "taken" || nameStatus === "checking"}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
};
