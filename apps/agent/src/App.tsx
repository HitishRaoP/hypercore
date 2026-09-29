import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Badge } from "@hypercore/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@hypercore/ui/components/breadcrumb";
import { Button } from "@hypercore/ui/components/button";
import { Separator } from "@hypercore/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@hypercore/ui/components/sidebar";
import { AlertCircle, ArrowRight, Loader2, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENT_PAGE_TITLES, AppSidebar, type AgentPage } from "./components/app-sidebar";
import { MachineDetailsCard } from "./components/MachineDetailsCard";
import { RegistrationForm } from "./components/RegistrationForm";
import { useActivity } from "./hooks/use-activity";
import { DeploymentsPage } from "./pages/deployments-page";
import { InsightsPage } from "./pages/insights-page";
import { LogsPage } from "./pages/logs-page";
import { MachinePage } from "./pages/machine-page";
import { SettingsPage } from "./pages/settings-page";
import type {
  MachineInfo,
  MetricsTick,
  RegistrationResponse,
  SavedRegistration,
  ToolchainStatus,
} from "./types";
import "./App.css";

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
  const [page, setPage] = useState<AgentPage>(() => {
    try {
      const saved = localStorage.getItem("hypercore-agent-page");
      if (saved === "machine" || saved === "logs" || saved === "deployments" || saved === "insights" || saved === "settings") {
        return saved;
      }
    } catch {
      /* storage unavailable — fall through to the default */
    }
    return "machine";
  });
  const [live, setLive] = useState(true);

  const machineId = info?.machineId ?? restoredMachineId;
  const registered = Boolean(registration && machineId);

  const activity = useActivity(coordinatorUrl, machineId, {
    enabled: registered && live,
  });
  const runningCount =
    activity.data?.invocations.filter((i) => i.status === "running").length ?? 0;
  const deploymentCount = activity.data?.deployments.length ?? 0;

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
    try {
      localStorage.setItem("hypercore-agent-page", page);
    } catch {
      /* storage unavailable */
    }
  }, [page]);
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
    setPage("logs");
  };

  if (restoring) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-4 text-base text-muted-foreground">
          Checking for an existing registration…
        </p>
      </div>
    );
  }

  if (!registered || !registration) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto px-6 py-10">
          {!info ? (
            <div className="m-auto flex w-full max-w-lg flex-col items-center justify-center text-center">
              <div className="mb-6 grid size-14 place-items-center rounded-2xl border bg-muted">
                <ScanSearch className="size-6 text-muted-foreground" />
              </div>
              <p className="font-mono text-base tracking-[0.2em] text-muted-foreground uppercase">
                Worker agent
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Ready to inspect this machine
              </h2>
              <p className="mt-3 max-w-sm text-base leading-6 text-muted-foreground">
                Collect local capacity and network details before connecting this
                worker to the HyperCore coordinator.
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
                <p className="font-mono text-base tracking-[0.2em] text-muted-foreground uppercase">
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
            <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-destructive px-4 py-3 text-base font-medium text-white shadow-lg">
              <AlertCircle className="size-4" />
              {error}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider className="h-full min-h-0">
      <AppSidebar
        page={page}
        onNavigate={setPage}
        hostname={info?.hostname ?? "Worker"}
        machineId={machineId}
        runningCount={runningCount}
        deploymentCount={deploymentCount}
        onDisconnect={() => void unregister()}
        className="top-9 h-[calc(100svh-2.25rem)]"
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{AGENT_PAGE_TITLES[page]}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Badge variant={activity.data?.online ? "default" : "secondary"}>
            {activity.data?.online ? "Connected" : "Idle"}
          </Badge>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
          {page === "machine" && (
            <MachinePage
              info={info}
              registration={registration}
              coordinatorUrl={coordinatorUrl}
            />
          )}
          {page === "logs" && (
            <LogsPage
              invocations={activity.data?.invocations ?? []}
              deployments={activity.data?.deployments ?? []}
              coordinatorUrl={coordinatorUrl}
              hostname={info?.hostname ?? "Worker"}
              machineId={machineId}
              region={registration.assignedRegion}
              nodeId={registration.nodeId}
              updatedAt={activity.updatedAt}
              error={activity.error}
              refreshing={activity.refreshing}
              onRefresh={() => void activity.refresh()}
              live={live}
              onLiveChange={setLive}
              source={activity.data?.source ?? null}
              online={activity.data?.online ?? false}
            />
          )}
          {page === "deployments" && (
            <DeploymentsPage
              deployments={activity.data?.deployments ?? []}
              updatedAt={activity.updatedAt}
              error={activity.error}
              refreshing={activity.refreshing}
              onRefresh={() => void activity.refresh()}
            />
          )}
          {page === "insights" && (
            <InsightsPage
              metrics={metrics}
              info={info}
              toolchain={toolchain}
              online={activity.data?.online ?? false}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              registration={registration}
              coordinatorUrl={coordinatorUrl}
              machineId={machineId}
              onUnregister={() => void unregister()}
            />
          )}
        </div>
        {error && (
          <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-destructive px-4 py-3 text-base font-medium text-white shadow-lg">
            <AlertCircle className="size-4" />
            {error}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
export default App;
