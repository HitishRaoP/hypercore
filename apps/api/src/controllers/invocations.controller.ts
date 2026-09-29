import type { Request, Response } from "express";
import { sendError } from "../lib/errors";
import type { AuthedRequest } from "../lib/auth";
import { toInvocationDto } from "../services/activity.service";
import {
  listInvocationsByUser,
  resolveInvocation,
} from "../services/invocation.service";

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

/** GET /invocations — invocations of the signed-in user's deployments. */
export async function listMyInvocations(req: Request, res: Response): Promise<Response> {
  try {
    const userId = (req as AuthedRequest).userId;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
    const rows = await listInvocationsByUser(userId, limit);
    return res.json({ invocations: rows.map(toInvocationDto) });
  } catch (error) {
    return sendError(res, error);
  }
}
