"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { CheckCircle2, Loader2 } from "lucide-react";

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
  fetchOnlineAgents,
  helloWorldFiles,
} from "../lib/deploy";

interface HWTemplateProps {
  onBack: () => void;
}

export const HWTemplate = ({ onBack }: HWTemplateProps) => {
  const [workerName, setWorkerName] = useState("long-poetry-3588");
  const [machineId, setMachineId] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [urls, setUrls] = useState<{ invokeUrl: string; workerUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchOnlineAgents().then((online) => {
      setAgents(online);
      if (online[0]) setMachineId((prev) => prev || online[0]!);
    });
  }, []);

  const deploy = async () => {
    setBusy(true);
    setMessage(null);
    setUrls(null);
    setError(null);
    try {
      if (!machineId.trim()) throw new Error("Pick a target node (machineId).");
      const formData = new FormData();
      formData.append("workerName", workerName.trim() || "hello-world");
      formData.append("machineId", machineId.trim());
      formData.append("entrypoint", "index.ts");
      for (const file of helloWorldFiles()) formData.append("files", file, file.name);
      const res = await axios.post(`${API_URL}/code-upload`, formData);
      setMessage(
        `${res.data.status === "routed" ? "Routed to node" : "Stored (node offline)"} · deployment ${res.data.deploymentId} · 3 files in R2. Agent builds index.ts → bundle.js (esbuild) → worker.wasm (javy).`,
      );
      setUrls({ invokeUrl: res.data.invokeUrl, workerUrl: res.data.workerUrl });
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
          <div className="relative">
            <Input
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              className="h-[45px] rounded-xl pr-[220px] text-[16px]"
            />
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-1 text-[16px]">
              <span>.hitish.hypercore.dev</span>
              <CheckCircle2 className="ml-2 h-5 w-5 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[16px] font-medium">Target node</label>
          <div className="flex gap-2">
            <Input
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              placeholder="machine-id (agent must be online)"
              className="h-[45px] rounded-xl font-mono text-sm"
            />
            <Button variant="outline" onClick={() => void fetchOnlineAgents().then(setAgents)}>
              Refresh
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {agents.length ? `Online: ${agents.join(", ")}` : "No agents online — register the HC Agent first."}
          </p>
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

        {message && (
          <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <p>{message}</p>
            {urls && (
              <>
                <p>
                  Invoke:{" "}
                  <a href={urls.invokeUrl} target="_blank" rel="noreferrer" className="font-mono underline">
                    {urls.invokeUrl}
                  </a>
                </p>
                <p>
                  Worker:{" "}
                  <a href={urls.workerUrl} target="_blank" rel="noreferrer" className="font-mono underline">
                    {urls.workerUrl}
                  </a>
                </p>
              </>
            )}
          </div>
        )}
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
