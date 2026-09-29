"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2 } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import { Input } from "@hypercore/ui/components/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import {
  API_URL,
  HELLO_WORLD_INDEX_TS,
  fetchNodes,
  helloWorldFiles,
  type DeployResultData,
  type MachineNode,
} from "../lib/deploy";
import { DeploySuccess } from "./deploy-success";
import { TargetNodeSelect } from "./target-node-select";

interface HWTemplateProps {
  onBack: () => void;
}

const WORKER_URL_PREFIX = `${API_URL}/w/`;

export const HWTemplate = ({ onBack }: HWTemplateProps) => {
  const [workerName, setWorkerName] = useState("long-poetry-3588");
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
      const res = await axios.post(`${API_URL}/code-upload`, formData);
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
          Minimal TS function + package.json + bun.lock. Uploads to R2, then
          routes to your node over SSE for the TS→JS→wasm build.
        </p>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 space-y-5 overflow-y-auto pb-6">
        <div className="space-y-2">
          <label className="text-[16px] font-medium">Worker name</label>
          <div className="flex">
            <span className="inline-flex h-[45px] max-w-[55%] shrink-0 items-center truncate rounded-l-xl border border-r-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
              {WORKER_URL_PREFIX}
            </span>
            <Input
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              placeholder="my-worker"
              className="h-[45px] rounded-l-none rounded-r-xl text-[16px]"
            />
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            Live at {WORKER_URL_PREFIX}
            {workerName.trim() || "<name>"}
          </p>
        </div>

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
          <p className="font-mono text-xs text-muted-foreground">
            index.ts · package.json · bun.lock → R2 raw/{"{deploymentId}"}/
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <pre className="overflow-x-auto whitespace-pre font-mono text-[14px] leading-6">
              <code>{HELLO_WORLD_INDEX_TS}</code>
            </pre>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
      </CardContent>

      <CardFooter className="m-0 flex shrink-0 items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={deploy} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
};
