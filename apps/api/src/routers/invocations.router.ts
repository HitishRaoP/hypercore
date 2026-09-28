import { Router } from "express";
import express from "express";
import { resolveInvocation } from "../lib/invocations";

const router = Router();

// Agent result callback. Generous JSON limit: stdout travels base64 and the
// executor caps it at 4MB (~5.4MB encoded).
router.use(express.json({ limit: "10mb" }));

/**
 * Agent posts the execution result after running the wasm locally:
 * POST /invocations/:invocationId/result
 * { machineId, ok, code, stdoutB64?, stdout?, stderr?, error?, timedOut? }
 */
router.post("/:invocationId/result", (req, res) => {
  const invocationId = req.params.invocationId as string;
  const ok = resolveInvocation(invocationId, req.body ?? {});
  if (!ok) return res.status(404).json({ error: "Unknown or expired invocationId" });
  return res.json({ status: "received", invocationId });
});

export default router;
