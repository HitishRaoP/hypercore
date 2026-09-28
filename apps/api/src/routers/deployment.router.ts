import { Router } from "express";
import { pushDeployment } from "../lib/scheduler";

const router = Router();

/**
 * Control Plane entrypoint. Upload flow stays the same
 * (Client -> Server -> Postgres metadata + R2 raw files);
 * instead of publishing to a RabbitMQ exchange, the server hands
 * the request to the in-process scheduler, which routes it down
 * the target agent's open SSE stream.
 */
router.post("/", (req, res) => {
  try {
    const { deploymentId, machineId, objectKey } = req.body ?? {};

    if (!deploymentId || !machineId || !objectKey) {
      return res.status(400).json({
        error: "deploymentId, machineId and objectKey are required",
      });
    }

    const delivered = pushDeployment({ deploymentId, machineId, objectKey });

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
 * Agent acknowledges completion/failure over plain HTTP.
 * This replaces the RabbitMQ ack/nack.
 */
router.post("/:deploymentId/ack", (req, res) => {
  const { deploymentId } = req.params;
  const { machineId, status, message } = req.body ?? {};
  console.log(
    `[scheduler] ack deployment=${deploymentId} machine=${machineId ?? "?"} status=${status ?? "done"}${message ? ` msg=${message}` : ""}`,
  );
  return res.json({ status: "acknowledged", deploymentId });
});

export default router;
