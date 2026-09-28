import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Router } from "express";
import multer from "multer";
import { pushDeployment } from "../lib/scheduler";
import { artifactKeyFor, R2_BUCKET, S3 } from "../lib/s3";
import { getDeployment, updateDeployment } from "../lib/store";
import { invalidateArtifactCache } from "../lib/wasm-runner";
import { invokeUrlFor, workerUrlFor } from "../lib/urls";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/**
 * Control Plane entrypoint. Upload flow stays the same
 * (Client -> Server -> Postgres metadata + R2 raw files);
 * instead of publishing to a RabbitMQ exchange, the server hands
 * the request to the in-process scheduler, which routes it down
 * the target agent's open SSE stream.
 *
 * Accepts both the legacy {deploymentId, machineId, objectKey} shape and
 * the new shape with {workerName, entrypoint, files:[{name,key}]}.
 */
router.post("/", (req, res) => {
  try {
    const { deploymentId, machineId, objectKey, workerName, entrypoint, files } = req.body ?? {};

    if (!deploymentId || !machineId || !objectKey) {
      return res.status(400).json({
        error: "deploymentId, machineId and objectKey are required",
      });
    }

    const delivered = pushDeployment({ deploymentId, machineId, objectKey, workerName, entrypoint, files });

    if (!delivered) {
      // Agent has no open SSE stream — surface immediately instead of
      // silently queueing into a broker the agent never reads.
      return res.status(503).json({
        status: "offline",
        deploymentId,
        machineId,
        error: "Target agent is not connected (no open SSE stream)",
      });
    }

    return res.status(202).json({
      status: "routed",
      deploymentId,
      machineId,
    });
  } catch (error) {
    console.error("Failed to route deployment:", error);
    return res.status(500).json({ error: "Failed to route deployment" });
  }
});

/**
 * Agent uploads its built wasm *through* the server; the server PUTs it
 * to R2 (artifacts/{deploymentId}/worker.wasm) with the S3 SDK so the
 * agent never holds R2 credentials.
 *
 * POST /deployment/:deploymentId/artifact  multipart field: wasm (or file)
 */
router.post("/:deploymentId/artifact", upload.single("wasm"), async (req, res) => {
  try {
    const deploymentId = req.params.deploymentId as string;
    let file = req.file;
    // Accept `file` alias used by some http clients.
    if (!file && (req as unknown as { files?: Express.Multer.File[] }).files?.length) {
      file = (req as unknown as { files: Express.Multer.File[] }).files[0];
    }
    if (!file) return res.status(400).json({ error: 'multipart field "wasm" is required' });

    const record = getDeployment(deploymentId);
    if (!record) return res.status(404).json({ error: "Unknown deploymentId" });

    const key = artifactKeyFor(deploymentId);
    await S3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: "application/wasm",
      }),
    );
    updateDeployment(deploymentId, { status: "built", artifactKey: key });
    invalidateArtifactCache(deploymentId);
    console.log(`[deployments] artifact stored deployment=${deploymentId} key=${key} bytes=${file.size}`);
    console.log(`[deployments] live at ${invokeUrlFor(deploymentId)} (worker: ${workerUrlFor(record.workerName)})`);
    return res.status(201).json({
      status: "stored",
      deploymentId,
      artifactKey: key,
      size: file.size,
      invokeUrl: invokeUrlFor(deploymentId),
      workerUrl: workerUrlFor(record.workerName),
    });
  } catch (error) {
    console.error("artifact upload failed:", error);
    return res.status(500).json({ error: "Failed to store artifact in R2" });
  }
});

/**
 * Agent acknowledges completion/failure over plain HTTP.
 * This replaces the RabbitMQ ack/nack.
 */
router.post("/:deploymentId/ack", (req, res) => {
  const deploymentId = req.params.deploymentId as string;
  const { machineId, status, message } = req.body ?? {};
  if (status === "failed") updateDeployment(deploymentId, { status: "failed" });
  else if (status === "done") updateDeployment(deploymentId, { status: getDeployment(deploymentId)?.artifactKey ? "built" : "building" });
  console.log(
    `[scheduler] ack deployment=${deploymentId} machine=${machineId ?? "?"} status=${status ?? "done"}${message ? ` msg=${message}` : ""}`,
  );
  return res.json({ status: "acknowledged", deploymentId });
});

export default router;
