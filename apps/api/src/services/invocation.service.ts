import { v4 as uuidv4 } from "uuid";
import { desc, eq } from "drizzle-orm";
import { db } from "@hypercore/db";
import {
  invocations,
  type InvocationRow,
  type NewInvocationRow,
} from "@hypercore/db/schema/invocations";
import { env } from "../lib/env";
import { pushEvent } from "../lib/scheduler";

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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
  deploymentId: string;
  workerName: string;
  artifactKey: string;
  method: string;
  path: string;
  query: string;
  bodyB64?: string;
}

export type InvokeOutcome =
  | { delivered: false }
  | { delivered: true; timeout: true }
  | { delivered: true; timeout?: false; result: AgentInvokeResult };

// ---------------------------------------------------------------------------
// In-flight waits (ephemeral: pending HTTP responses)
// ---------------------------------------------------------------------------

interface PendingWaiter {
  timer: NodeJS.Timeout;
  settle: (outcome: InvokeOutcome) => void;
}

const pending = new Map<string, PendingWaiter>();

function trackWaiter(invocationId: string, settle: PendingWaiter["settle"], waitMs: number): void {
  const timer = setTimeout(() => {
    pending.delete(invocationId);
    settle({ delivered: true, timeout: true });
  }, waitMs);
  // Don't keep the process alive for a lone timer.
  timer.unref?.();
  pending.set(invocationId, { timer, settle });
}

/** Settles and removes a waiter. Returns false when unknown/expired. */
function settleWaiter(invocationId: string, outcome: InvokeOutcome): boolean {
  const waiter = pending.get(invocationId);
  if (!waiter) return false;
  pending.delete(invocationId);
  clearTimeout(waiter.timer);
  waiter.settle(outcome);
  return true;
}

/** Agent result callback. Returns false when unknown/expired. */
export function resolveInvocation(invocationId: string, result: AgentInvokeResult): boolean {
  return settleWaiter(invocationId, { delivered: true, result });
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
    deploymentId: dispatch.deploymentId,
    workerName: dispatch.workerName,
    machineId: dispatch.machineId,
    method: dispatch.method,
    path: dispatch.path,
  });

  return new Promise<InvokeOutcome>((resolve) => {
    const settle = (outcome: InvokeOutcome) => {
      void recordFinished(invocationId, outcome, Date.now() - startedMs).finally(() =>
        resolve(outcome),
      );
    };
    trackWaiter(invocationId, settle, serverWaitMs);

    const delivered = pushEvent(dispatch.machineId, "invoke", {
      invocationId,
      ...dispatch,
      timeoutMs: agentTimeoutMs,
    });
    if (!delivered) settle({ delivered: false });
  });
}

// ---------------------------------------------------------------------------
// Persistence (best-effort: a DB blip must not break request serving)
// ---------------------------------------------------------------------------

type StartedRow = Pick<
  NewInvocationRow,
  "id" | "deploymentId" | "workerName" | "machineId" | "method" | "path"
>;

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
