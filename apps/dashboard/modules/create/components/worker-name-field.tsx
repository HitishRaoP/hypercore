"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Dices, Loader2, XCircle } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import { Input } from "@hypercore/ui/components/input";
import { cn } from "@hypercore/ui/lib/utils";
import {
  API_URL,
  checkWorkerNameTaken,
  generateWorkerSlug,
} from "../lib/deploy";

export type WorkerNameStatus = "idle" | "checking" | "available" | "taken" | "unknown";

const WORKER_URL_PREFIX = `${API_URL}/w/`;

interface WorkerNameFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onStatusChange?: (status: WorkerNameStatus) => void;
  /** Height applied to the prefix addon, input and regenerate button. */
  heightClass?: string;
}

export const WorkerNameField = ({
  id,
  value,
  onChange,
  onStatusChange,
  heightClass = "h-[45px]",
}: WorkerNameFieldProps) => {
  const [status, setStatus] = useState<WorkerNameStatus>("idle");
  const [generating, setGenerating] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    const name = value.trim();
    if (!name) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    const current = ++requestId.current;
    const timer = setTimeout(() => {
      void (async () => {
        const taken = await checkWorkerNameTaken(name);
        if (requestId.current !== current) return;
        setStatus(taken === true ? "taken" : taken === false ? "available" : "unknown");
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [value]);

  const regenerate = async () => {
    setGenerating(true);
    try {
      let slug = generateWorkerSlug();
      for (let attempt = 0; attempt < 8; attempt++) {
        const taken = await checkWorkerNameTaken(slug);
        if (taken !== true) break;
        slug = generateWorkerSlug();
      }
      onChange(slug);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-[16px] font-medium">
        Worker name
      </label>
      <div className="flex">
        <span
          className={cn(
            "inline-flex max-w-[55%] shrink-0 items-center truncate rounded-l-xl border border-r-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground",
            heightClass,
          )}
        >
          {WORKER_URL_PREFIX}
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="my-worker"
          className={cn("flex-1 rounded-none border-x-0 text-[16px]", heightClass)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void regenerate()}
          disabled={generating}
          title="Generate a new unique name"
          aria-label="Generate a new unique name"
          className={cn("shrink-0 rounded-l-none rounded-r-xl px-3", heightClass)}
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Dices className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="space-y-0.5">
        {status === "checking" && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking availability…
          </p>
        )}
        {status === "available" && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--ds-green-900)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Name available
          </p>
        )}
        {status === "taken" && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--ds-red-900)]">
            <XCircle className="h-3.5 w-3.5" />
            Name already taken — pick another or regenerate.
          </p>
        )}
        {status === "unknown" && (
          <p className="text-sm text-[var(--ds-amber-900)]">
            Couldn&apos;t verify availability — the server will validate on deploy.
          </p>
        )}
      </div>
    </div>
  );
};
