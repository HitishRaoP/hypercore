"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import axios from "axios";
import { FolderOpen, Loader2 } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@hypercore/ui/components/field";
import {
  fetchNodes,
  generateAvailableWorkerSlug,
  generateWorkerSlug,
  type DeployResultData,
  type MachineNode,
} from "../lib/deploy";
import { env } from "@/lib/env";
import { DeploySuccess } from "./deploy-success";
import { TargetNodeSelect } from "./target-node-select";
import { WorkerNameField, type WorkerNameStatus } from "./worker-name-field";

interface UploadCodeProps {
  onBack: () => void;
}

type DeployResult = { ok: true; data: DeployResultData } | { ok: false; error: string };

export function UploadCode({ onBack }: UploadCodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes] = useState<MachineNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [nameStatus, setNameStatus] = useState<WorkerNameStatus>("idle");

  const refreshNodes = async () => {
    setLoadingNodes(true);
    try {
      setNodes(await fetchNodes());
    } finally {
      setLoadingNodes(false);
    }
  };

  useEffect(() => {
    void refreshNodes();
  }, []);

  // Generated once per mount, so the form never opens on a stale slug.
  const [initialWorkerName] = useState(generateWorkerSlug);

  const form = useForm({
    defaultValues: {
      workerName: initialWorkerName,
      machineId: "",
      entrypoint: "index.ts",
      files: [] as File[],
    },

    onSubmit: async ({ value }) => {
      setSubmitting(true);
      setResult(null);
      try {
        if (!value.machineId) throw new Error("Pick a target node.");
        if (!value.files.length) throw new Error("Upload a .ts file, package.json and bun.lock.");
        const names = value.files.map((f) => f.name);
        if (!names.some((n) => n.endsWith(".ts"))) throw new Error("A .ts function file is required.");
        if (!names.includes("package.json")) throw new Error("package.json is required.");

        const formData = new FormData();
        formData.append("workerName", value.workerName);
        formData.append("machineId", value.machineId);
        formData.append("entrypoint", value.entrypoint || "index.ts");
        for (const file of value.files) formData.append("files", file, file.name);

        const res = await axios.post(`${env.API_URL}/code-upload`, formData, {
          withCredentials: true,
        });
        setResult({
          ok: true,
          data: {
            status: res.data.status,
            deploymentId: res.data.deploymentId,
            workerName: res.data.workerName,
            machineId: res.data.machineId,
            entrypoint: res.data.entrypoint,
            files: res.data.files ?? [],
            invokeUrl: res.data.invokeUrl,
            workerUrl: res.data.workerUrl,
          },
        });
        // Passing values also rebases the defaults, so the next deploy starts
        // from a fresh slug instead of reusing the one we just consumed.
        form.reset({
          workerName: await generateAvailableWorkerSlug(),
          machineId: "",
          entrypoint: "index.ts",
          files: [],
        });
      } catch (error) {
        const message =
          axios.isAxiosError(error)
            ? (error.response?.data?.error as string | undefined) ?? error.message
            : error instanceof Error
              ? error.message
              : "Upload failed.";
        setResult({ ok: false, error: message });
      } finally {
        setSubmitting(false);
      }
    },
  });

  if (result?.ok) {
    return <DeploySuccess result={result.data} onBack={onBack} onReset={() => setResult(null)} />;
  }

  return (
    <Card className="w-1/2 overflow-hidden pb-0 sm:w-2/3 md:w-full">
      <CardHeader>
        <h1 className="text-xl">Upload and deploy</h1>
        <p className="text-sm text-muted-foreground">
          Upload your TS function file, package.json and bun.lock. Raw files go
          to R2, then the scheduler routes the deployment to your node over SSE.
        </p>
      </CardHeader>

      <CardContent>
        <form
          id="upload-code-form"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="workerName">
            {(field) => (
              <WorkerNameField
                id={field.name}
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
                onStatusChange={setNameStatus}
                heightClass="h-9"
              />
            )}
          </form.Field>

          <form.Field name="machineId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Target node</FieldLabel>
                <TargetNodeSelect
                  value={field.state.value}
                  onChange={(id) => field.handleChange(id)}
                  nodes={nodes}
                  loading={loadingNodes}
                  onRefresh={() => void refreshNodes()}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="entrypoint">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Entrypoint</FieldLabel>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="index.ts"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="files">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Files (.ts + package.json + bun.lock)</FieldLabel>
                <div
                  onClick={() => inputRef.current?.click()}
                  className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--ds-gray-400)] bg-white px-4 py-6 transition-colors hover:bg-[var(--ds-gray-100)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ds-gray-400)]">
                    <FolderOpen className="h-5 w-5 text-[var(--ds-gray-900)]" />
                  </div>
                  <p className="mt-3 text-sm text-[var(--ds-gray-1000)]">
                    Drag in or click to{" "}
                    <span className="underline underline-offset-2">upload files</span>.
                  </p>
                  <FieldDescription className="mt-2 text-sm text-[var(--ds-gray-900)]">
                    Select index.ts, package.json and bun.lock (up to 10 files)
                  </FieldDescription>
                  {field.state.value.length > 0 && (
                    <ul className="mt-3 w-full space-y-1 text-sm text-[var(--ds-gray-1000)]">
                      {field.state.value.map((f) => (
                        <li key={f.name} className="font-mono text-sm">
                          {f.name} · {(f.size / 1024).toFixed(1)} KB
                        </li>
                      ))}
                    </ul>
                  )}
                  <Input
                    ref={inputRef}
                    id={field.name}
                    type="file"
                    multiple
                    accept=".ts,.json,.lock,.lockb,application/json"
                    className="hidden"
                    onChange={(e) =>
                      field.handleChange(Array.from(e.target.files ?? []))
                    }
                  />
                </div>
              </Field>
            )}
          </form.Field>

          {result && !result.ok && (
            <p className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
              {result.error}
            </p>
          )}
        </form>
      </CardContent>

      <CardFooter className="m-0 flex items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="submit"
          form="upload-code-form"
          disabled={submitting || nameStatus === "taken" || nameStatus === "checking"}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
}
