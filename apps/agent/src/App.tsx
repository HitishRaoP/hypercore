import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, ArrowRight, Check, Copy, LogOut, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityView } from "./components/ActivityView";
import { Header } from "./components/Header";
import { LiveMetricsDashboard } from "./components/LiveMetricsDashboard";
import { MachineDetailsCard } from "./components/MachineDetailsCard";
import { RegistrationForm } from "./components/RegistrationForm";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
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
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Machine ID</p>
        <button
          onClick={() => void copy()}
          title="Copy machine ID"
          className="mt-1 flex max-w-full items-center gap-2 font-mono text-xs text-zinc-200 transition hover:text-white"
        >
          <span className="truncate">{machineId}</span>
          {copied ? (
            <Check className="size-3.5 shrink-0 text-emerald-400" />
          ) : (
            <Copy className="size-3.5 shrink-0 text-zinc-500" />
          )}
        </button>
        <p className="mt-2 font-mono text-[11px] text-zinc-600">
          Node {registration.nodeId} · {registration.assignedRegion} · {coordinatorUrl}
        </p>
      </div>
      <button
        onClick={onUnregister}
        title="Forget this registration on this machine"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
      >
        <LogOut className="size-3.5" />
        Disconnect
      </button>
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
    <div className="min-h-screen bg-black text-zinc-100">
      <Header online={registered} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        {restoring ? (
          <div className="mx-auto flex min-h-[480px] max-w-lg flex-col items-center justify-center text-center">
            <span className="size-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-200" />
            <p className="mt-5 text-sm text-zinc-400">
              Checking for an existing registration…
            </p>
          </div>
        ) : registered && registration ? (
          <div className="space-y-5">
            <NodeIdentityBar
              machineId={machineId}
              registration={registration}
              coordinatorUrl={coordinatorUrl}
              onUnregister={() => void unregister()}
            />
            <div className="flex gap-1 rounded-lg border border-zinc-800 bg-[#0a0a0a] p-1">
              {(["activity", "metrics"] as const).map((name) => (
                <button
                  key={name}
                  onClick={() => setTab(name)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${
                    tab === name ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
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
            <div className="mb-6 grid size-14 place-items-center rounded-2xl border border-zinc-800 bg-[#0a0a0a]">
              <ScanSearch className="size-6 text-zinc-400" />
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
              Worker agent
            </p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight">
              Ready to inspect this machine
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
              Collect local capacity and network details before connecting this
              worker to the HyperCore coordinator.
            </p>
            <p className="mt-4 max-w-sm font-mono text-[11px] leading-5 break-all text-zinc-600">
              Build tools (bundled): esbuild {toolchain?.esbuild ?? "missing"} ·
              javy {toolchain?.javy ?? "missing"}
            </p>
            <Button
              loading={loading}
              onClick={() => void scan()}
              className="mt-7"
            >
              <ScanSearch className="size-4" />
              Scan Machine Specs
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                Step 2 of 3
              </p>
              <h2 className="mt-2 text-xl font-medium tracking-tight">
                Machine verified. Connect your coordinator.
              </h2>
            </div>
            <MachineDetailsCard info={info} />
            <RegistrationForm onRegister={register} />
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-rose-900/80 bg-rose-950 px-4 py-3 text-sm text-rose-200 shadow-2xl">
            <AlertCircle className="size-4" />
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
export default App;
