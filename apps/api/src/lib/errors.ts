import type { Response } from "express";

/** Service-layer failure with an explicit HTTP status. Throw from services, map in controllers. */
export class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

/** Duplicate worker_name (pre-check hit or unique-constraint race). Always 409. */
export class WorkerNameTakenError extends HttpError {
	constructor(workerName: string) {
		super(409, `workerName "${workerName}" is already taken`);
		this.name = "WorkerNameTakenError";
	}
}

/** Controller catch-all: known errors keep their status, everything else is a logged 500. */
export function sendError(res: Response, error: unknown): Response {
	if (error instanceof HttpError) {
		return res.status(error.status).json({ error: error.message });
	}
	console.error("Request failed:", error);
	return res.status(500).json({ error: "Internal server error" });
}
