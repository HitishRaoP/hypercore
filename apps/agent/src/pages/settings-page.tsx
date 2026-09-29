import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";
import { Label } from "@hypercore/ui/components/label";
import { Separator } from "@hypercore/ui/components/separator";
import { Check, Copy, LogOut } from "lucide-react";
import { useState } from "react";
import type { RegistrationResponse, ToolchainStatus } from "../types";

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm first:pt-0 last:pb-0">
      <Label className="text-muted-foreground">{label}</Label>
      <span className={mono ? "font-mono text-xs break-all" : "text-sm"}>{value}</span>
    </div>
  );
}

export function SettingsPage({
  registration,
  coordinatorUrl,
  machineId,
  toolchain,
  onUnregister,
}: {
  registration: RegistrationResponse;
  coordinatorUrl: string;
  machineId: string;
  toolchain: ToolchainStatus | null;
  onUnregister: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(coordinatorUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
      <div className="shrink-0">
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connection, node identity and build tools.
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto pb-1">
      <Card className="gap-0 py-0">
        <div className="px-6 py-5">
          <h3 className="text-sm font-medium">Coordinator</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The coordinator this node is registered with.
          </p>
          <div className="mt-4 flex gap-2">
            <Input value={coordinatorUrl} readOnly className="font-mono" />
            <Button variant="outline" size="icon" onClick={() => void copyUrl()} title="Copy coordinator URL">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
        <Separator />
        <div className="px-6 py-5">
          <h3 className="text-sm font-medium">Node</h3>
          <div className="mt-3 divide-y">
            <Row label="Node ID" value={registration.nodeId} mono />
            <Row label="Machine ID" value={machineId} mono />
            <Row label="Region" value={registration.assignedRegion} />
            <Row label="Heartbeat" value={`every ${registration.heartbeatIntervalSecs}s`} />
          </div>
        </div>
        <Separator />
        <div className="px-6 py-5">
          <h3 className="text-sm font-medium">Build tools</h3>
          <div className="mt-3 divide-y">
            <Row label="esbuild" value={toolchain?.esbuild ?? "missing"} mono />
            <Row label="javy" value={toolchain?.javy ?? "missing"} mono />
          </div>
        </div>
      </Card>

      <Card className="border-destructive/40">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h3 className="text-sm font-medium">Disconnect this node</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Forget the saved registration on this machine. You can re-register at any time.
            </p>
          </div>
          <Button variant="destructive" onClick={onUnregister}>
            <LogOut />
            Disconnect
          </Button>
        </div>
      </Card>

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">Status</span>
        <Badge variant="secondary">{registration.status}</Badge>
      </div>
      </div>
    </div>
  );
}
