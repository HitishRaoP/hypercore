import type { Request, Response } from "express";
import { HttpError, sendError } from "../lib/errors";
import { getActivity } from "../services/activity.service";

/** GET /activity?machineId=<id>&limit=50 — deployments + request history for one node. */
export async function getActivityByMachine(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		const machineId = String(req.query.machineId ?? "").trim();
		if (!machineId)
			throw new HttpError(400, "machineId query param is required");
		const limit = Math.min(
			Math.max(Number(req.query.limit ?? 50) || 50, 1),
			100,
		);
		return res.json(await getActivity(machineId, limit));
	} catch (error) {
		return sendError(res, error);
	}
}
