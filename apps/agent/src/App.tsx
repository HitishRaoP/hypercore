import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@hypercore/ui/components/button";
import { Card, CardContent } from "@hypercore/ui/components/card";
import { AlertCircle, ArrowRight, Check, Copy, Loader2, LogOut, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityView } from "./components/ActivityView";
import { Header } from "./components/Header";
import { LiveMetricsDashboard } from "./components/LiveMetricsDashboard";
import { MachineDetailsCard } from "./components/MachineDetailsCard";
import { RegistrationForm } from "./components/RegistrationForm";
import type {
  MachineInfo,
  MetricsTick,
  RegistrationResponse,
  SavedRegistration,
  ToolchainStatus,
} from "./types";
import "./App.css";

function NodeIdentityBar({
  machineId,
  registration,
  coordinatorUrl,
  onUnregister,
}: {
  machineId: string;
  registration: RegistrationResponse;
  coordinatorUrl: string;
  onUnregister: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Machine ID</p>
          <button
            onClick={() => void copy()}
            title="Copy machine ID"
            className="mt-1 flex max-w-full items-center gap-2 font-mono text-sm transition-colors hover:text-muted-foreground"
          >
            <span className="truncate">{machineId}</span>
            {copied ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              <Copy className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Node {registration.nodeId} · {registration.assignedRegion} · {coordinatorUrl}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onUnregister}
          title="Forget this registration on this machine"
        >
          <LogOut />
          Disconnect
        </Button>
      </CardContent>
    </Card>
  );
}

function App() {
  const [info, setInfo] = useState<MachineInfo | null>(null);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(
    null,
  );
  const [restoredMachineId, setRestoredMachineId] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [metrics, setMetrics] = useState<MetricsTick>({
    cpuPercent: 0,
    usedMemoryMb: 0,
    totalMemoryMb: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toolchain, setToolchain] = useState<ToolchainStatus | null>(null);
  const [coordinatorUrl, setCoordinatorUrl] = useState("");
  const [tab, setTab] = useState<"activity" | "metrics">("activity");

  const machineId = info?.machineId ?? restoredMachineId;
  const registered = Boolean(registration && machineId);

  useEffect(() => {
    invoke<ToolchainStatus>("get_toolchain_status")
      .then(setToolchain)
      .catch(() => null);
  }, []);
  // Restore a previous registration (if this machine already registered)
  // so the scan/register steps are skipped on restart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await invoke<SavedRegistration | null>(
          "get_saved_registration",
        );
        if (cancelled || !saved) return;
        setRegistration(saved.registration);
        setCoordinatorUrl(saved.coordinatorUrl);
        setRestoredMachineId(saved.machineId);
        try {
          setInfo(await invoke<MachineInfo>("get_machine_info"));
        } catch {
          /* activity view can still run on the saved machine id */
        }
      } catch {
        /* no saved session — fall through to the scan step */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<MetricsTick>("metrics_tick", (event) =>
      setMetrics(event.payload),
    ).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, []);
  const scan = async () => {
    setLoading(true);
    setError("");
    try {
      setInfo(await invoke<MachineInfo>("get_machine_info"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to inspect this machine.",
      );
    } finally {
      setLoading(false);
    }
  };
  const register = async (url: string) => {
    setError("");
    try {
      const response = await invoke<RegistrationResponse>("register_node", {
        coordinatorUrl: url,
      });
      setRegistration(response);
      setCoordinatorUrl(url);
      // The backend persists the registration to disk; keep the freshly
      // scanned machine id in sync for the activity feed.
      if (info) setRestoredMachineId(info.machineId);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Registration could not be completed.";
      setError(message);
      throw reason;
    }
  };
  const unregister = async () => {
    setError("");
    try {
      await invoke("unregister_node");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not clear the saved registration.",
      );
      return;
    }
    setRegistration(null);
    setCoordinatorUrl("");
    setRestoredMachineId("");
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header online={registered} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {restoring ? (
          <div className="mx-auto flex min-h-[480px] max-w-lg flex-col items-center justify-center text-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Checking for an existing registration…
            </p>
          </div>
        ) : registered && registration ? (
          <div className="space-y-6">
            <NodeIdentityBar
              machineId={machineId}
              registration={registration}
              coordinatorUrl={coordinatorUrl}
              onUnregister={() => void unregister()}
            />
            <div className="flex gap-1 rounded-lg border bg-muted p-1">
              {(["activity", "metrics"] as const).map((name) => (
                <button
                  key={name}
                  onClick={() => setTab(name)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    tab === name ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {tab === "activity" ? (
              <ActivityView coordinatorUrl={coordinatorUrl} machineId={machineId} />
            ) : (
              <LiveMetricsDashboard metrics={metrics} registration={registration} />
            )}
          </div>
        ) : !info ? (
          <div className="mx-auto flex min-h-[480px] max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-6 grid size-14 place-items-center rounded-2xl border bg-muted">
              <ScanSearch className="size-6 text-muted-foreground" />
            </div>
            <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Worker agent
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Ready to inspect this machine
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              Collect local capacity and network details before connecting this
              worker to the HyperCore coordinator.
            </p>
            <p className="mt-4 max-w-sm font-mono text-xs leading-5 break-all text-muted-foreground">
              Build tools (bundled): esbuild {toolchain?.esbuild ?? "missing"} ·
              javy {toolchain?.javy ?? "missing"}
            </p>
            <Button
              disabled={loading}
              onClick={() => void scan()}
              className="mt-7"
            >
              {loading ? <Loader2 className="animate-spin" /> : <ScanSearch />}
              Scan Machine Specs
              <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
                Step 2 of 3
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                Machine verified. Connect your coordinator.
              </h2>
            </div>
            <MachineDetailsCard info={info} />
            <RegistrationForm onRegister={register} />
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border-transparent bg-destructive px-4 py-3 text-sm font-medium text-white shadow-lg">
            <AlertCircle className="size-4" />
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
export default App;
