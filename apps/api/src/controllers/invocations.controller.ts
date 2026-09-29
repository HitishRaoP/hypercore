import type { Request, Response } from "express";
import { resolveInvocation } from "../services/invocation.service";

/**
 * Agent posts the execution result after running the wasm locally:
 * POST /invocations/:invocationId/result
 * { machineId, ok, code, stdoutB64?, stdout?, stderr?, error?, timedOut? }
 */
export function postInvocationResult(req: Request, res: Response): Response {
  const invocationId = req.params.invocationId as string;
  const ok = resolveInvocation(invocationId, req.body ?? {});
  if (!ok) return res.status(404).json({ error: "Unknown or expired invocationId" });
  return res.json({ status: "received", invocationId });
}
