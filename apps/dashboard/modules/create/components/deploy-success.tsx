"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Package,
  Rocket,
  Server,
} from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import type { DeployResultData } from "../lib/deploy";

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={copy}
      aria-label="Copy to clipboard"
      className="shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--ds-green-900)]" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
};

const UrlRow = ({
  label,
  url,
  hint,
}: {
  label: string;
  url: string;
  hint?: string;
}) => (
  <div className="rounded-xl border bg-[var(--ds-gray-100)] p-4">
    <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
    <div className="mt-1 flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate font-mono text-sm text-[var(--ds-blue-900)] underline underline-offset-2 hover:text-[var(--ds-blue-900)]"
      >
        {url}
      </a>
      <CopyButton text={url} />
      <Button type="button" variant="ghost" size="icon-xs" asChild className="shrink-0">
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
    {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
  </div>
);

const MetaRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
    <span className="min-w-0 text-right font-mono text-sm break-all">{children}</span>
  </div>
);

interface DeploySuccessProps {
  result: DeployResultData;
  onBack: () => void;
  onReset: () => void;
  className?: string;
}

export const DeploySuccess = ({ result, onBack, onReset, className }: DeploySuccessProps) => {
  const routed = result.status === "routed";

  return (
    <Card
      className={`flex max-h-[calc(100vh-228px)] w-1/2 flex-col overflow-hidden pb-0 sm:w-2/3 md:w-full ${className ?? ""}`}
    >
      <CardHeader className="shrink-0">
        <div className="flex items-center gap-2">
          {routed ? (
            <CircleCheck className="h-5 w-5 shrink-0 text-[var(--ds-green-900)]" />
          ) : (
            <Server className="h-5 w-5 shrink-0 text-[var(--ds-amber-900)]" />
          )}
          <h1 className="text-xl">
            {routed ? "Deployment live" : "Deployment stored"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {routed
            ? "Routed to your node over SSE. The agent builds index.ts → bundle.js (esbuild) → worker.wasm (javy)."
            : "Target node is offline, so the bundle is stored and will be picked up when the agent reconnects."}
        </p>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
        <UrlRow
          label="Worker URL"
          url={result.workerUrl}
          hint="Stable URL — always serves the latest built deployment."
        />
        <UrlRow
          label="Invoke URL"
          url={result.invokeUrl}
          hint="Immutable per-deployment URL."
        />

        <div className="divide-y divide-[var(--ds-gray-200)] rounded-xl border px-4 py-2">
          <MetaRow label="Deployment">
            <span className="inline-flex items-center gap-1">
              {result.deploymentId}
              <CopyButton text={result.deploymentId} />
            </span>
          </MetaRow>
          <MetaRow label="Worker">{result.workerName}</MetaRow>
          <MetaRow label="Target node">{result.machineId}</MetaRow>
          <MetaRow label="Entrypoint">{result.entrypoint}</MetaRow>
          <MetaRow label="Status">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium ${
                routed ? "bg-[var(--ds-green-100)] text-[var(--ds-green-900)]" : "bg-[var(--ds-amber-100)] text-[var(--ds-amber-900)]"
              }`}
            >
              {routed ? <Rocket className="h-3 w-3" /> : <Package className="h-3 w-3" />}
              {result.status}
            </span>
          </MetaRow>
          <MetaRow label="Files">
            {result.files.length
              ? result.files.map((f) => f.name).join(", ")
              : `${result.entrypoint} + dependencies`}
          </MetaRow>
        </div>
      </CardContent>

      <CardFooter className="m-0 flex shrink-0 items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onReset}>Deploy another</Button>
      </CardFooter>
    </Card>
  );
};
