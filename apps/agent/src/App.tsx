import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, ArrowRight, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { LiveMetricsDashboard } from "./components/LiveMetricsDashboard";
import { MachineDetailsCard } from "./components/MachineDetailsCard";
import { RegistrationForm } from "./components/RegistrationForm";
import { Button } from "./components/ui/Button";
import type { MachineInfo, MetricsTick, RegistrationResponse } from "./types";
import "./App.css";

function App() {
  const [info, setInfo] = useState<MachineInfo | null>(null);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(
    null,
  );
  const [metrics, setMetrics] = useState<MetricsTick>({
    cpuPercent: 0,
    usedMemoryMb: 0,
    totalMemoryMb: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  const register = async (token: string, coordinatorUrl: string) => {
    setError("");
    try {
      setRegistration(
        await invoke<RegistrationResponse>("register_node", {
          token,
          coordinatorUrl,
        }),
      );
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Registration could not be completed.";
      setError(message);
      throw reason;
    }
  };
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <Header online={Boolean(registration)} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        {!info ? (
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
        ) : registration ? (
          <LiveMetricsDashboard metrics={metrics} registration={registration} />
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
