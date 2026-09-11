import { Router } from "express";
import { sendDeployment } from "../lib/rabbitmq.ts";

const router = Router();

router.post("/deployments", async (req, res) => {
  try {
    const {
      deploymentId,
      machineId,
      objectKey,
    } = req.body;

    if (!deploymentId || !machineId || !objectKey) {
      return res.status(400).json({
        error: "deploymentId, machineId and objectKey are required",
      });
    }

    await sendDeployment({
      deploymentId,
      machineId,
      objectKey,
    });

    return res.status(202).json({
      status: "queued",
      deploymentId,
      machineId,
    });
  } catch (error) {
    console.error("Failed to queue deployment:", error);

    return res.status(500).json({
      error: "Failed to queue deployment",
    });
  }
});

export default router;