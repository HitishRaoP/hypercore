import { v4 as uuidv4 } from "uuid";
import { desc, eq } from "drizzle-orm";
import { db } from "@hypercore/db";
import {
  invocations,
  type InvocationRow,
  type NewInvocationRow,
} from "@hypercore/db/schema/invocations";
import { env } from "../lib/env";
import { pushEvent, listOnlineAgents } from "../lib/scheduler";

/**
 * Invocation fan-out + durable history.
 *
 * A user-facing URL hit is forwarded to the owning agent over its open SSE
 * stream (`event: invoke`); the agent runs the wasm locally and POSTs the
 * result back to /invocations/:id/result, which releases the waiting HTTP
 * response. The server never executes wasm itself.
 *
 * State is split in two on purpose:
 * - Postgres (`invocations` table) records every lifecycle transition.
 * - The `pending` map below holds only in-flight waits (invocationId ->
 *   the HTTP response's resolver). It is ephemeral by nature and dies
 *   with the process; the DB row keeps status=running in that case.
 */

export type InvocationStatus = "running" | "done" | "failed" | "timeout";

/** What the agent POSTs back after executing the wasm. */
export interface AgentInvokeResult {
  machineId?: string;
  ok: boolean;
  code?: number;
  /** Raw stdout, base64 (preferred — binary-safe). */
  stdoutB64?: string;
  /** Plain-text stdout fallback. */
  stdout?: string;
  stderr?: string;
  error?: string;
  timedOut?: boolean;
}

/** Everything the agent needs to execute one request. */
export interface InvokeDispatch {
  machineId: string;
  userId: string | null;
  deploymentId: string;
  workerName: string;
  artifactKey: string;
  method: string;
  path: string;
  query: string;
  bodyB64?: string;
}

export type InvokeOutcome =
  | { delivered: false; fallbackAttempted: boolean; fallbackCandidates: number }
  | { delivered: true; timeout: true; servedBy: string; fallback: boolean }
  | {
      delivered: true;
      timeout?: false;
      result: AgentInvokeResult;
      servedBy: string;
      fallback: boolean;
    };

// ---------------------------------------------------------------------------
// In-flight waits (ephemeral: pending HTTP responses)
// ---------------------------------------------------------------------------

interface PendingWaiter {
  timer: NodeJS.Timeout;
  settle: (outcome: InvokeOutcome) => void;
  servedBy: string;
  fallback: boolean;
}

const pending = new Map<string, PendingWaiter>();

console.log("[invoke] fallback routing + db rendezvous enabled");

function trackWaiter(
  invocationId: string,
  settle: PendingWaiter["settle"],
  waitMs: number,
  servedBy: string,
  fallback: boolean,
): void {
  const timer = setTimeout(() => {
    const waiter = pending.get(invocationId);
    pending.delete(invocationId);
    console.log(
      `[invoke] timeout ${invocationId} servedBy=${waiter?.servedBy ?? servedBy} fallback=${waiter?.fallback ?? fallback}`,
    );
    settle({
      delivered: true,
      timeout: true,
      servedBy: waiter?.servedBy ?? servedBy,
      fallback: waiter?.fallback ?? fallback,
    });
  }, waitMs);
  // Don't keep the process alive for a lone timer.
  timer.unref?.();
  pending.set(invocationId, { timer, settle, servedBy, fallback });
}

/** Settles and removes a waiter. Returns false when unknown/expired. */
function settleWaiter(
  invocationId: string,
  outcome: { delivered: true; timeout: true } | { delivered: true; result: AgentInvokeResult },
): boolean {
  const waiter = pending.get(invocationId);
  if (!waiter) return false;
  pending.delete(invocationId);
  clearTimeout(waiter.timer);
  if ("result" in outcome) {
    waiter.settle({
      delivered: true,
      result: outcome.result,
      servedBy: waiter.servedBy,
      fallback: waiter.fallback,
    });
  } else {
    waiter.settle({
      delivered: true,
      timeout: true,
      servedBy: waiter.servedBy,
      fallback: waiter.fallback,
    });
  }
  return true;
}

/** Agent result callback. Returns false when unknown/expired. */
export function resolveInvocation(invocationId: string, result: AgentInvokeResult): boolean {
  return settleWaiter(invocationId, { delivered: true, result });
}

/** Durable fallback: persist an agent result straight to Postgres.
 * Used when no in-memory waiter exists (other API replica, or restart).
 * Returns true when the invocation row existed. */
export async function persistAgentResult(
  invocationId: string,
  result: AgentInvokeResult,
): Promise<boolean> {
  try {
    const finishedAt = new Date();
    const failed = !result.ok || (result.code !== undefined && result.code !== 0);
    const timedOut = result.timedOut === true;
    const [existing] = await db
      .select({ createdAt: invocations.createdAt })
      .from(invocations)
      .where(eq(invocations.id, invocationId))
      .limit(1);
    if (!existing) return false;
    // Late/cross-instance results still get a real duration instead of "—".
    const durationMs = Math.max(0, finishedAt.getTime() - existing.createdAt.getTime());
    await db
      .update(invocations)
      .set({
        status: timedOut ? "timeout" : failed ? "failed" : "done",
        exitCode: result.code ?? null,
        durationMs,
        stdoutPreview: previewStdout(result) || null,
        error:
          result.error ??
          (timedOut ? "Node did not respond in time" : failed ? `Exited with code ${result.code}` : null),
        finishedAt,
      })
      .where(eq(invocations.id, invocationId));
    return true;
  } catch (error) {
    console.warn("[db] invocation result persist skipped:", (error as Error).message);
    return false;
  }
}

/** Single durable read for the cross-instance poll loop. */
async function getInvocationById(invocationId: string): Promise<InvocationRow | undefined> {
  try {
    const [row] = await db
      .select()
      .from(invocations)
      .where(eq(invocations.id, invocationId))
      .limit(1);
    return row;
  } catch {
    return undefined;
  }
}

function cancelWaiter(invocationId: string): void {
  const waiter = pending.get(invocationId);
  if (!waiter) return;
  pending.delete(invocationId);
  clearTimeout(waiter.timer);
}

// ---------------------------------------------------------------------------
// History reads
// ---------------------------------------------------------------------------

export async function listInvocationsByMachine(
  machineId: string,
  limit: number,
): Promise<InvocationRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return db
    .select()
    .from(invocations)
    .where(eq(invocations.machineId, machineId))
    .orderBy(desc(invocations.createdAt))
    .limit(safeLimit);
}

/** Invocations of one user's deployments, newest first. */
export async function listInvocationsByUser(
  userId: string,
  limit: number,
): Promise<InvocationRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return db
    .select()
    .from(invocations)
    .where(eq(invocations.userId, userId))
    .orderBy(desc(invocations.createdAt))
    .limit(safeLimit);
}

// ---------------------------------------------------------------------------
// Dispatch: the main entry point
// ---------------------------------------------------------------------------

/** Forwards one request to the owning agent and resolves with its outcome. */
export async function invokeOnAgent(dispatch: InvokeDispatch): Promise<InvokeOutcome> {
  const invocationId = uuidv4();
  const startedMs = Date.now();

  // The agent kills runaway executions before the server gives up waiting.
  const agentTimeoutMs = Math.max(1000, env.INVOKE_TIMEOUT_MS - 2000);
  const serverWaitMs = env.INVOKE_TIMEOUT_MS + 5000;

  // Persist before dispatching: a fast agent response must find its row.
  await recordStarted({
    id: invocationId,
    userId: dispatch.userId,
    deploymentId: dispatch.deploymentId,
    workerName: dispatch.workerName,
    machineId: dispatch.machineId,
    method: dispatch.method,
    path: dispatch.path,
  });

  return new Promise<InvokeOutcome>((resolve) => {
    let done = false;
    const pollRef: { current: NodeJS.Timeout | null } = { current: null };
    const settle = (outcome: InvokeOutcome) => {
      if (done) return;
      done = true;
      if (pollRef.current) clearInterval(pollRef.current);
      const elapsedMs = Date.now() - startedMs;
      const what = !outcome.delivered
        ? "undelivered"
        : outcome.timeout
          ? "timeout"
          : `status=${outcome.result.ok ? "ok" : "err"}`;
      console.log(
        `[invoke] settled ${invocationId} ${what} in ${elapsedMs}ms fallback=${outcome.delivered ? outcome.fallback : false}`,
      );
      void recordFinished(invocationId, outcome, Date.now() - startedMs).finally(() =>
        resolve(outcome),
      );
    };

    // Waiter first: the agent can POST /result before pushEvent returns,
    // otherwise a fast (cached-wasm) fallback resolves to 404.
    trackWaiter(invocationId, settle, serverWaitMs, dispatch.machineId, false);

    // Cross-instance safety: pending is per-process. If the agent's POST
    // lands on another API replica (or this process restarts), the waiter
    // above never fires — poll the durable row instead so the HTTP request
    // still completes (with the stored preview) instead of hanging to 504.
    pollRef.current = setInterval(() => {
      void (async () => {
        if (done) return;
        const row = await getInvocationById(invocationId);
        if (!row || row.status === "running" || !row.finishedAt) return;
        const waiter = pending.get(invocationId);
        if (waiter) {
          clearTimeout(waiter.timer);
          pending.delete(invocationId);
        }
        const failed = row.status !== "done";
        settle({
          delivered: true,
          result: {
            machineId: row.machineId,
            ok: !failed,
            code: row.exitCode ?? undefined,
            stdout: row.stdoutPreview ?? undefined,
            stderr: "",
            error: row.error ?? undefined,
          },
          servedBy: row.machineId,
          fallback: waiter?.fallback ?? row.machineId !== dispatch.machineId,
        });
      })();
    }, 750);
    if (pollRef.current.unref) pollRef.current.unref();

    // Primary path (unchanged): owner node only.
    const primaryPayload = {
      invocationId,
      ...dispatch,
      timeoutMs: agentTimeoutMs,
    };
    if (pushEvent(dispatch.machineId, "invoke", primaryPayload)) {
      return;
    }

    // Fallback path: owner is offline. Try any other online node. The
    // fallback pulls worker.wasm from R2 via /code-upload/file on cache
    // miss, so no pre-replication is needed.
    const candidates = shuffle(listOnlineAgents().filter((id) => id !== dispatch.machineId));
    for (const fallbackId of candidates) {
      const fallbackPayload = {
        invocationId,
        ...dispatch,
        machineId: fallbackId,
        ownerMachineId: dispatch.machineId,
        fallback: true,
        timeoutMs: agentTimeoutMs,
      };
      if (pushEvent(fallbackId, "invoke", fallbackPayload)) {
        console.log(
          `[invoke] fallback ${invocationId} owner=${dispatch.machineId} -> ${fallbackId}`,
        );
        // Attribute history to the node that actually executed.
        void retargetInvocationMachine(invocationId, fallbackId);
        const waiter = pending.get(invocationId);
        if (waiter) {
          waiter.servedBy = fallbackId;
          waiter.fallback = true;
        }
        return;
      }
    }

    cancelWaiter(invocationId);
    settle({ delivered: false, fallbackAttempted: true, fallbackCandidates: candidates.length });
  });
}

// ---------------------------------------------------------------------------
// Persistence (best-effort: a DB blip must not break request serving)
// ---------------------------------------------------------------------------

type StartedRow = Pick<
  NewInvocationRow,
  "id" | "userId" | "deploymentId" | "workerName" | "machineId" | "method" | "path"
>;

function shuffle<T>(ids: T[]): T[] {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = ids[i] as T;
    ids[i] = ids[j] as T;
    ids[j] = tmp;
  }
  return ids;
}

/** Best-effort: point the running row at the fallback executor. */
async function retargetInvocationMachine(invocationId: string, machineId: string): Promise<void> {
  try {
    await db.update(invocations).set({ machineId }).where(eq(invocations.id, invocationId));
  } catch (error) {
    console.warn("[db] invocation retarget skipped:", (error as Error).message);
  }
}

async function recordStarted(row: StartedRow): Promise<void> {
  try {
    await db.insert(invocations).values({ ...row, status: "running" }).onConflictDoNothing();
  } catch (error) {
    console.warn("[db] invocation persist skipped:", (error as Error).message);
  }
}

async function recordFinished(
  invocationId: string,
  outcome: InvokeOutcome,
  durationMs: number,
): Promise<void> {
  try {
    await db
      .update(invocations)
      .set({ ...toFinishedUpdate(outcome, durationMs), finishedAt: new Date() })
      .where(eq(invocations.id, invocationId));
  } catch (error) {
    console.warn("[db] invocation update skipped:", (error as Error).message);
  }
}

function toFinishedUpdate(
  outcome: InvokeOutcome,
  durationMs: number,
): Pick<NewInvocationRow, "status" | "exitCode" | "durationMs" | "stdoutPreview" | "error"> {
  if (!outcome.delivered) {
    return {
      status: "failed",
      exitCode: null,
      durationMs,
      stdoutPreview: null,
      error: "Node is offline (no open SSE stream)",
    };
  }
  if (outcome.timeout) {
    return {
      status: "timeout",
      exitCode: null,
      durationMs,
      stdoutPreview: null,
      error: "Node did not respond in time",
    };
  }
  const result = outcome.result;
  const failed = !result.ok || result.code !== 0;
  return {
    status: failed ? "failed" : "done",
    exitCode: result.code ?? null,
    durationMs,
    stdoutPreview: previewStdout(result) || null,
    error: result.error ?? (failed ? `Exited with code ${result.code}` : null),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STDOUT_PREVIEW_LIMIT = 2000;

function previewStdout(result: AgentInvokeResult): string {
  if (result.stdoutB64) {
    try {
      return Buffer.from(result.stdoutB64, "base64").toString("utf8").slice(0, STDOUT_PREVIEW_LIMIT);
    } catch {
      // fall through to the plain-text field
    }
  }
  return (result.stdout ?? "").slice(0, STDOUT_PREVIEW_LIMIT);
}
