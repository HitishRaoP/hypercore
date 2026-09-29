import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Auto-update state machine for the agent.
 *
 * Windows installers kill the running process while installing, so the
 * `update.installed` state is the last thing the UI ever renders — the
 * relaunch below is a no-op there and only matters on macOS/Linux.
 */
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "up-to-date"
  | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  /** 0..1, or null while the server does not report a content length. */
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
}

const IDLE: UpdaterState = {
  phase: "idle",
  version: null,
  notes: null,
  progress: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
};

export function useUpdater(opts?: { autoCheck?: boolean }) {
  const autoCheck = opts?.autoCheck ?? true;
  const [state, setState] = useState<UpdaterState>(IDLE);
  // The pending `Update` object is not serialisable state and must not
  // trigger re-renders, so it lives in a ref until the user installs.
  const pending = useRef<Update | null>(null);
  const checking = useRef(false);

  const runCheck = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    // Release the handle held by a previous check before asking again.
    const previous = pending.current;
    pending.current = null;
    if (previous) await previous.close().catch(() => undefined);
    setState((prev) => ({ ...prev, phase: "checking", error: null }));
    try {
      const update = await check();
      if (update) {
        pending.current = update;
        setState({
          phase: "available",
          version: update.version,
          notes: update.body ?? null,
          progress: null,
          downloadedBytes: 0,
          totalBytes: null,
          error: null,
        });
      } else {
        pending.current = null;
        setState({ ...IDLE, phase: "up-to-date" });
      }
    } catch (reason) {
      // Dev builds and offline machines land here — never fatal, the agent
      // has to keep working against its coordinator either way.
      pending.current = null;
      setState({
        ...IDLE,
        phase: "error",
        error: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      checking.current = false;
    }
  }, []);

  // Drop the handle when the window goes away so the runtime does not keep
  // the check alive behind a closed webview.
  useEffect(() => {
    return () => {
      pending.current?.close().catch(() => undefined);
      pending.current = null;
    };
  }, []);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update) return;
    let downloaded = 0;
    setState((prev) => ({
      ...prev,
      phase: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: null,
    }));
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setState((prev) => ({
              ...prev,
              totalBytes: event.data.contentLength ?? null,
              progress: 0,
            }));
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setState((prev) => ({
              ...prev,
              downloadedBytes: downloaded,
              progress: prev.totalBytes
                ? Math.min(1, downloaded / prev.totalBytes)
                : null,
            }));
            break;
          case "Finished":
            setState((prev) => ({ ...prev, phase: "installing", progress: 1 }));
            break;
        }
      });
      setState((prev) => ({ ...prev, phase: "installed", progress: 1 }));
      pending.current = null;
    } catch (reason) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: reason instanceof Error ? reason.message : String(reason),
      }));
    }
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    // `tauri dev` runs an unbundled binary that the updater refuses to touch,
    // so the background poll is pointless noise while developing.
    if (import.meta.env.DEV) return;
    // Small delay so the check never competes with the registration
    // restore + machine scan that runs on first paint.
    const timer = window.setTimeout(() => void runCheck(), 4000);
    return () => window.clearTimeout(timer);
  }, [autoCheck, runCheck]);

  return { state, check: runCheck, install };
}
