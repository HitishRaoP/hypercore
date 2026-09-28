import { randomUUID } from "node:crypto";
import { persistInvocationFinish, persistInvocationInsert } from "./db";
import { env } from "./env";
import { pushEvent } from "./scheduler";

/**
 * Invocation fan-out + history: URL hits are forwarded to the owning agent
 * over its open SSE stream (`event: invoke`), and the agent POSTs the
 * execution result back to /invocations/:id/result. Pending HTTP responses
 * wait here. Every lifecycle transition is mirrored to Postgres
 * (`invocations` table) best-effort and kept in a capped in-memory log so
 * the activity UI works with or without a database.
 */

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

export interface InvokeDispatch {
  machineId: string;
  deploymentId: string;
  workerName: string;
  artifactKey?: string;
  method: string;
  path: string;
  query: string;
  bodyB64?: string;
}

export type InvocationStatus = "running" | "done" | "failed" | "timeout";

export interface InvocationRecord {
  invocationId: string;
  deploymentId: string;
  workerName: string;
  machineId: string;
  method: string;
  path: string;
  status: InvocationStatus;
  exitCode?: number | null;
  durationMs?: number | null;
  stdoutPreview?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export type InvokeOutcome =
  | { delivered: false }
  | { delivered: true; timeout: true }
  | { delivered: true; timeout?: false; result: AgentInvokeResult };

const pending = new Map<
  string,
  { timer: NodeJS.Timeout; settle: (outcome: InvokeOutcome) => void }
>();

const invocationLog = new Map<string, InvocationRecord>();
const MAX_LOG = 200;

export function listInvocations(machineId: string, limit: number) {
  return [...invocationLog.values()]
    .filter((record) => record.machineId === machineId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, Math.max(limit, 1));
}

function decodePreview(result: AgentInvokeResult): string {
  if (result.stdoutB64) {
    try {
      return Buffer.from(result.stdoutB64, "base64").toString("utf8").slice(0, 2000);
    } catch {
      // fall through to plain-text field
    }
  }
  return (result.stdout ?? "").slice(0, 2000);
}

function finalize(
  record: InvocationRecord,
  outcome: InvokeOutcome,
  startedMs: number,
) {
  const durationMs = Date.now() - startedMs;
  record.durationMs = durationMs;
  record.finishedAt = new Date().toISOString();

  if (!outcome.delivered) {
    record.status = "failed";
    record.error = "Node is offline (no open SSE stream)";
  } else if (outcome.timeout) {
    record.status = "timeout";
    record.error = "Node did not respond in time";
  } else {
    const result = outcome.result;
    record.status = result.ok && result.code === 0 ? "done" : "failed";
    record.exitCode = result.code ?? null;
    record.stdoutPreview = decodePreview(result) || undefined;
    record.error = result.error ?? (record.status === "failed" ? `Exited with code ${result.code}` : undefined);
  }

  void persistInvocationFinish(record.invocationId, {
    status: record.status,
    exitCode: record.exitCode ?? null,
    durationMs,
    stdoutPreview: record.stdoutPreview ?? null,
    error: record.error ?? null,
  });
}

export function invokeOnAgent(dispatch: InvokeDispatch): Promise<InvokeOutcome> {
  const invocationId = randomUUID();
  // The agent kills runaway executions before the server gives up waiting.
  const agentTimeoutMs = Math.max(1000, env.INVOKE_TIMEOUT_MS - 2000);
  const waitMs = env.INVOKE_TIMEOUT_MS + 5000;

  return new Promise((resolve) => {
    const startedMs = Date.now();
    const record: InvocationRecord = {
      invocationId,
      deploymentId: dispatch.deploymentId,
      workerName: dispatch.workerName,
      machineId: dispatch.machineId,
      method: dispatch.method,
      path: dispatch.path,
      status: "running",
      startedAt: new Date(startedMs).toISOString(),
    };
    invocationLog.set(invocationId, record);
    if (invocationLog.size > MAX_LOG) {
      const oldest = invocationLog.keys().next().value;
      if (oldest) invocationLog.delete(oldest);
    }
    void persistInvocationInsert({
      id: invocationId,
      deploymentId: dispatch.deploymentId,
      workerName: dispatch.workerName,
      machineId: dispatch.machineId,
      method: dispatch.method,
      path: dispatch.path,
      status: "running",
    });

    const settle = (outcome: InvokeOutcome) => {
      finalize(record, outcome, startedMs);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      pending.delete(invocationId);
      settle({ delivered: true, timeout: true });
    }, waitMs);
    // Avoid leaking the timer handle when the process exits early.
    timer.unref?.();
    pending.set(invocationId, { timer, settle });

    const delivered = pushEvent(dispatch.machineId, "invoke", {
      invocationId,
      ...dispatch,
      timeoutMs: agentTimeoutMs,
    });
    if (!delivered) {
      clearTimeout(timer);
      pending.delete(invocationId);
      settle({ delivered: false });
    }
  });
}

export function resolveInvocation(
  invocationId: string,
  result: AgentInvokeResult,
): boolean {
  const entry = pending.get(invocationId);
  if (!entry) return false;
  pending.delete(invocationId);
  clearTimeout(entry.timer);
  entry.settle({ delivered: true, result });
  return true;
}
