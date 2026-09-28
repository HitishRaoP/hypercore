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
import { API_URL, fetchOnlineAgents } from "../lib/deploy";

interface UploadCodeProps {
  onBack: () => void;
}

type DeployResult =
  | { ok: true; status: string; deploymentId: string; invokeUrl: string; workerUrl: string; files: { name: string; key: string }[] }
  | { ok: false; error: string };

export function UploadCode({ onBack }: UploadCodeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  useEffect(() => {
    void fetchOnlineAgents().then(setAgents);
  }, []);

  const form = useForm({
    defaultValues: {
      workerName: "hello-world",
      machineId: "",
      entrypoint: "index.ts",
      files: [] as File[],
    },

    onSubmit: async ({ value }) => {
      setSubmitting(true);
      setResult(null);
      try {
        if (!value.machineId) throw new Error("Pick a target node (machineId).");
        if (!value.files.length) throw new Error("Upload a .ts file, package.json and bun.lock.");
        const names = value.files.map((f) => f.name);
        if (!names.some((n) => n.endsWith(".ts"))) throw new Error("A .ts function file is required.");
        if (!names.includes("package.json")) throw new Error("package.json is required.");

        const formData = new FormData();
        formData.append("workerName", value.workerName);
        formData.append("machineId", value.machineId);
        formData.append("entrypoint", value.entrypoint || "index.ts");
        for (const file of value.files) formData.append("files", file, file.name);

        const res = await axios.post(`${API_URL}/code-upload`, formData);
        setResult({
          ok: true,
          status: res.data.status,
          deploymentId: res.data.deploymentId,
          invokeUrl: res.data.invokeUrl,
          workerUrl: res.data.workerUrl,
          files: res.data.files ?? [],
        });
        form.reset();
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
              <Field>
                <FieldLabel htmlFor={field.name}>Worker name</FieldLabel>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="hello-world"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="machineId">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Target node</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="machine-id (agent must be online)"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void fetchOnlineAgents().then(setAgents)}
                  >
                    Refresh
                  </Button>
                </div>
                <FieldDescription>
                  {agents.length
                    ? `Online: ${agents.join(", ")}`
                    : "No agents online — start the HC Agent and register first."}
                </FieldDescription>
                {agents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {agents.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => field.handleChange(id)}
                        className="rounded-md border px-2 py-1 font-mono text-xs hover:bg-zinc-100"
                      >
                        {id.slice(0, 12)}…
                      </button>
                    ))}
                  </div>
                )}
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
                  className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 transition-colors hover:bg-zinc-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300">
                    <FolderOpen className="h-5 w-5 text-zinc-500" />
                  </div>
                  <p className="mt-3 text-[15px] text-zinc-700">
                    Drag in or click to{" "}
                    <span className="underline underline-offset-2">upload files</span>.
                  </p>
                  <FieldDescription className="mt-2 text-sm text-zinc-500">
                    Select index.ts, package.json and bun.lock (up to 10 files)
                  </FieldDescription>
                  {field.state.value.length > 0 && (
                    <ul className="mt-3 w-full space-y-1 text-sm text-zinc-900">
                      {field.state.value.map((f) => (
                        <li key={f.name} className="font-mono text-xs">
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

          {result?.ok && (
            <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <p>
                {result.status === "routed" ? "Routed to node" : "Stored (node offline)"} ·
                deployment <span className="font-mono">{result.deploymentId}</span> ·
                {result.files.length} file(s) in R2. The agent builds TS→JS→wasm
                and uploads the wasm back via the server.
              </p>
              <p>
                Invoke:{" "}
                <a href={result.invokeUrl} target="_blank" rel="noreferrer" className="font-mono underline">
                  {result.invokeUrl}
                </a>
              </p>
              <p>
                Worker:{" "}
                <a href={result.workerUrl} target="_blank" rel="noreferrer" className="font-mono underline">
                  {result.workerUrl}
                </a>{" "}
                <span className="text-green-700">(live once the build lands; 409 until then)</span>
              </p>
            </div>
          )}
          {result && !result.ok && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {result.error}
            </p>
          )}
        </form>
      </CardContent>

      <CardFooter className="m-0 flex items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" form="upload-code-form" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Deploy
        </Button>
      </CardFooter>
    </Card>
  );
}
