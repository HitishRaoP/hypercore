import type { Request, Response } from "express";
import type { AuthedRequest } from "../lib/auth";
import { sendError } from "../lib/errors";
import { toInvocationDto } from "../services/activity.service";
import {
	listInvocationsByUser,
	persistAgentResult,
	resolveInvocation,
} from "../services/invocation.service";

/**
 * Agent posts the execution result after running the wasm locally:
 * POST /invocations/:invocationId/result
 * { machineId, ok, code, stdoutB64?, stdout?, stderr?, error?, timedOut? }
 */
export async function postInvocationResult(
	req: Request,
	res: Response,
): Promise<Response> {
	const invocationId = req.params.invocationId as string;
	const body = req.body ?? {};
	if (resolveInvocation(invocationId, body)) {
		console.log(
			`[invoke] result ${invocationId} received (same-process)`,
		);
		return res.json({ status: "received", invocationId });
	}
	// No in-memory waiter: different API replica or a restart since dispatch.
	// Persist durably so the waiting poll loop (and history) still completes
	// instead of sticking at running + logging 404 on the agent.
	const persisted = await persistAgentResult(invocationId, body);
	if (persisted) {
		console.log(
			`[invoke] result ${invocationId} received-via-db (no waiter)`,
		);
		return res.json({ status: "received-via-db", invocationId });
	}
	console.warn(
		`[invoke] result for unknown invocation ${invocationId} (pending: gone, db: miss)`,
	);
	return res.status(404).json({ error: "Unknown or expired invocationId" });
}

/** GET /invocations — invocations of the signed-in user's deployments. */
export async function listMyInvocations(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const userId = (req as AuthedRequest).userId;
		const limit = Math.min(
			Math.max(Number(req.query.limit ?? 50) || 50, 1),
			100,
		);
		const rows = await listInvocationsByUser(userId, limit);
		return res.json({ invocations: rows.map(toInvocationDto) });
	} catch (error) {
		return sendError(res, error);
	}
}
