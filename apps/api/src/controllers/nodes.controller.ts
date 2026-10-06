import type { Request, Response } from "express";
import { sendError } from "../lib/errors";
import {
	getMachineById,
	listMachines,
	registerMachine,
	toMachineDto,
} from "../services/nodes.service";

/**
 * POST /api/v1/nodes/register — body: { machine: <MachineInfo camelCase> }.
 * Upserts the node and returns the agent's RegistrationResponse.
 */
export async function registerNode(
	req: Request,
	res: Response,
): Promise<Response> {
	try {
		return res.json(await registerMachine(req.body?.machine));
	} catch (error) {
		return sendError(res, error);
	}
}

/** GET /api/v1/nodes — all registered nodes, most recently seen first. */
export async function listNodes(
	_req: Request,
	res: Response,
): Promise<Response> {
	try {
		return res.json({
			nodes: (await listMachines()).map(toMachineDto),
		});
	} catch (error) {
		return sendError(res, error);
	}
}

/** GET /api/v1/nodes/:machineId — one registered node. */
export async function getNode(req: Request, res: Response): Promise<Response> {
	try {
		const row = await getMachineById(req.params.machineId as string);
		if (!row)
			return res.status(404).json({ error: "Unknown machineId" });
		return res.json(toMachineDto(row));
	} catch (error) {
		return sendError(res, error);
	}
}
