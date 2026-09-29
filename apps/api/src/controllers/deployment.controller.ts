import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Request, Response } from "express";
import { HttpError, sendError, WorkerNameTakenError } from "../lib/errors";
import { artifactKeyFor, R2_BUCKET, S3 } from "../lib/s3";
import { pushDeployment } from "../lib/scheduler";
import { invokeUrlFor, workerUrlFor } from "../lib/urls";
import type { AuthedRequest } from "../lib/auth";
import { toDeploymentDto } from "../services/activity.service";
import {
  getDeploymentById,
  isWorkerNameTaken,
  listDeploymentsByUser,
  markDeploymentBuilt,
  updateDeploymentStatus,
} from "../services/deployment.service";

/**
 * Legacy control-plane entrypoint: routes a pre-staged deployment to one
 * agent over SSE. Accepts {deploymentId, machineId, objectKey} plus the
 * optional new shape ({workerName, entrypoint, files}).
 */
export async function routeDeployment(req: Request, res: Response): Promise<Response> {
  try {
    const { deploymentId, machineId, objectKey, workerName, entrypoint, files } = req.body ?? {};
    if (!deploymentId || !machineId || !objectKey) {
      throw new HttpError(400, "deploymentId, machineId and objectKey are required");
    }
    if (workerName) {
      const existing = await getDeploymentById(deploymentId);
      if (existing?.workerName !== workerName && (await isWorkerNameTaken(workerName))) {
        throw new WorkerNameTakenError(workerName);
      }
    }

    const delivered = pushDeployment({ deploymentId, machineId, objectKey, workerName, entrypoint, files });
    if (!delivered) {
      // No open SSE stream — surface immediately instead of silently
      // queueing into a broker the agent never reads.
      return res.status(503).json({
        status: "offline",
        deploymentId,
        machineId,
        error: "Target agent is not connected (no open SSE stream)",
      });
    }
    return res.status(202).json({ status: "routed", deploymentId, machineId });
  } catch (error) {
    return sendError(res, error);
  }
}

/**
 * POST /deployment/:deploymentId/artifact — the agent uploads its built
 * wasm *through* the server (multipart `wasm` field); the server PUTs it to
 * R2 (artifacts/{deploymentId}/worker.wasm) so the agent never holds R2
 * credentials.
 */
export async function uploadArtifact(req: Request, res: Response): Promise<Response | void> {
  try {
    const deploymentId = req.params.deploymentId as string;
    let file = req.file;
    // Accept the `file` alias used by some http clients.
    if (!file && (req as unknown as { files?: Express.Multer.File[] }).files?.length) {
      file = (req as unknown as { files: Express.Multer.File[] }).files[0];
    }
    if (!file) throw new HttpError(400, 'multipart field "wasm" is required');

    const record = await getDeploymentById(deploymentId);
    if (!record) throw new HttpError(404, "Unknown deploymentId");

    const key = artifactKeyFor(deploymentId);
    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: "application/wasm",
      }),
    );
    await markDeploymentBuilt(deploymentId, key);

    console.log(`[deployments] artifact stored deployment=${deploymentId} key=${key} bytes=${file.size}`);
    console.log(
      `[deployments] live at ${invokeUrlFor(deploymentId)} (worker: ${workerUrlFor(record.workerName)})`,
    );
    return res.status(201).json({
      status: "stored",
      deploymentId,
      artifactKey: key,
      size: file.size,
      invokeUrl: invokeUrlFor(deploymentId),
      workerUrl: workerUrlFor(record.workerName),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

/** GET /deployment — deployments owned by the signed-in user. */
export async function listMyDeployments(req: Request, res: Response): Promise<Response> {
  try {
    const userId = (req as AuthedRequest).userId;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
    const rows = await listDeploymentsByUser(userId, limit);
    return res.json({ deployments: rows.map(toDeploymentDto) });
  } catch (error) {
    return sendError(res, error);
  }
}

/** Agent acknowledges build completion/failure over plain HTTP. */
export async function acknowledgeDeployment(req: Request, res: Response): Promise<Response> {
  const deploymentId = req.params.deploymentId as string;
  const { machineId, status, message } = req.body ?? {};
  if (status === "failed") {
    await updateDeploymentStatus(deploymentId, "failed");
  } else if (status === "done") {
    const record = await getDeploymentById(deploymentId);
    await updateDeploymentStatus(deploymentId, record?.artifactKey ? "built" : "building");
  }
  console.log(
    `[scheduler] ack deployment=${deploymentId} machine=${machineId ?? "?"} status=${status ?? "done"}${message ? ` msg=${message}` : ""}`,
  );
  return res.json({ status: "acknowledged", deploymentId });
}
