import { randomUUID } from "node:crypto";
import { env } from "./env";
import { pushEvent } from "./scheduler";

/**
 * Invocation fan-out: URL hits are forwarded to the owning agent over its
 * open SSE stream (`event: invoke`), and the agent POSTs the execution
 * result back to /invocations/:id/result. Pending HTTP responses wait here.
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

export type InvokeOutcome =
  | { delivered: false }
  | { delivered: true; timeout: true }
  | { delivered: true; timeout?: false; result: AgentInvokeResult };

const pending = new Map<
  string,
  { timer: NodeJS.Timeout; settle: (outcome: InvokeOutcome) => void }
>();

export function invokeOnAgent(dispatch: InvokeDispatch): Promise<InvokeOutcome> {
  const invocationId = randomUUID();
  // The agent kills runaway executions before the server gives up waiting.
  const agentTimeoutMs = Math.max(1000, env.INVOKE_TIMEOUT_MS - 2000);
  const waitMs = env.INVOKE_TIMEOUT_MS + 5000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(invocationId);
      resolve({ delivered: true, timeout: true });
    }, waitMs);
    // Avoid leaking the timer handle when the process exits early.
    timer.unref?.();
    pending.set(invocationId, { timer, settle: resolve });

    const delivered = pushEvent(dispatch.machineId, "invoke", {
      invocationId,
      ...dispatch,
      timeoutMs: agentTimeoutMs,
    });
    if (!delivered) {
      clearTimeout(timer);
      pending.delete(invocationId);
      resolve({ delivered: false });
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
