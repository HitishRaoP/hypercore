import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { HttpError, sendError, WorkerNameTakenError } from "../lib/errors";
import { pushDeployment } from "../lib/scheduler";
import { invokeUrlFor, workerUrlFor } from "../lib/urls";
import type { AuthedRequest } from "../lib/auth";
import { toDeploymentDto } from "../services/activity.service";
import {
  createDeployment,
  getDeploymentById,
  isWorkerNameTaken,
  updateDeploymentStatus,
} from "../services/deployment.service";
import {
  assertReadableKey,
  fetchRawObject,
  HELLO_WORLD,
  resolveEntrypoint,
  storeRawFiles,
  validateUploadInput,
} from "../services/upload.service";

/**
 * POST /code-upload — multipart bundle (workerName, machineId, entrypoint?,
 * files[]). Flow: validate -> uniqueness check -> PUT raw files to R2 ->
 * insert deployment row -> route to the node over SSE.
 */

export function getTemplate(_req: Request, res: Response): Response {
  return res.json(HELLO_WORLD);
}

/** GET /code-upload/check-name?workerName= — uniqueness probe for the dashboard. */
export async function checkWorkerNameAvailability(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const workerName = String(req.query.workerName ?? "").trim();
    if (!workerName) {
      return res.status(400).json({ error: "workerName query param is required" });
    }
    return res.json({ workerName, taken: await isWorkerNameTaken(workerName) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function uploadCode(req: Request, res: Response): Promise<Response | void> {
  try {
    const workerName = String(req.body?.workerName ?? "").trim();
    const machineId = String(req.body?.machineId ?? "").trim();
    const entrypoint = String(req.body?.entrypoint ?? "index.ts").trim() || "index.ts";
    const files = (req.files ?? []) as Express.Multer.File[];

    const names = validateUploadInput(workerName, machineId, files);
    if (await isWorkerNameTaken(workerName)) throw new WorkerNameTakenError(workerName);

    const deploymentId = uuidv4();
    const stored = await storeRawFiles(deploymentId, files, names);
    const entryName = resolveEntrypoint(names, entrypoint);
    const entry = stored.find((file) => file.name === entryName);
    if (!entry) throw new HttpError(500, "Failed to resolve entrypoint");

    // Unique-constraint race surfaces here as WorkerNameTakenError -> 409.
    await createDeployment({
      deploymentId,
      userId: (req as AuthedRequest).userId,
      workerName,
      machineId,
      entrypoint: entry.name,
      files: stored,
    });

    const delivered = pushDeployment({
      deploymentId,
      machineId,
      objectKey: entry.key,
      workerName,
      entrypoint: entry.name,
      files: stored.map(({ name, key }) => ({ name, key })),
    });
    await updateDeploymentStatus(deploymentId, delivered ? "routed" : "offline");

    return res.status(202).json({
      status: delivered ? "routed" : "offline",
      deploymentId,
      workerName,
      machineId,
      entrypoint: entry.name,
      files: stored,
      invokeUrl: invokeUrlFor(deploymentId),
      workerUrl: workerUrlFor(workerName),
      ...(delivered ? {} : { error: "Target agent is not connected (no open SSE stream)" }),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * GET /code-upload/file?key=raw/... — R2 proxy so agents need no R2
 * credentials. Only raw/ and artifacts/ prefixes are readable.
 */
export async function proxyFile(req: Request, res: Response): Promise<Response | void> {
  try {
    const key = String(req.query.key ?? "");
    assertReadableKey(key);
    const out = await fetchRawObject(key);

    if (out.ContentType) res.setHeader("Content-Type", out.ContentType);
    if (out.ContentLength) res.setHeader("Content-Length", String(out.ContentLength));
    if (out.ETag) res.setHeader("ETag", out.ETag);

    const body = out.Body as unknown as NodeJS.ReadableStream | undefined;
    if (body && typeof body.pipe === "function") {
      body.pipe(res);
      return;
    }
    // Fallback: the SDK may return a web stream / buffer instead.
    const bytes = await (
      out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    )?.transformToByteArray?.();
    if (bytes) return res.send(Buffer.from(bytes));
    throw new HttpError(500, "Unreadable R2 object");
  } catch (error) {
    return sendError(res, error);
  }
}

/** GET /code-upload/:deploymentId/files — manifest the agent pulls. */
export async function getDeploymentFiles(req: Request, res: Response): Promise<Response> {
  const record = await getDeploymentById(req.params.deploymentId as string);
  if (!record) return res.status(404).json({ error: "Unknown deploymentId" });
  return res.json(toDeploymentDto(record));
}
