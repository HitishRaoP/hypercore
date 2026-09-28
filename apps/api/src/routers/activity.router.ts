import { Router } from "express";
import { fetchActivity } from "../lib/db";
import { listInvocations } from "../lib/invocations";
import { isAgentOnline } from "../lib/scheduler";
import { listDeployments } from "../lib/store";

const router = Router();

/**
 * GET /activity?machineId=<id>&limit=50
 * Deployments + request history for one node. Reads Postgres when
 * DATABASE_URL is configured, otherwise the in-memory log (same shape).
 */
router.get("/", async (req, res) => {
  const machineId = String(req.query.machineId ?? "").trim();
  if (!machineId) {
    return res.status(400).json({ error: "machineId query param is required" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);

  const pg = await fetchActivity(machineId, limit);
  if (pg) {
    // Normalize Date objects to ISO strings to match the memory shape.
    const normalized = JSON.parse(JSON.stringify(pg)) as typeof pg;
    return res.json({
      source: "postgres",
      online: isAgentOnline(machineId),
      deployments: normalized.deployments,
      invocations: normalized.invocations.map((row) => ({
        invocationId: row.id,
        deploymentId: row.deploymentId,
        workerName: row.workerName,
        machineId: row.machineId,
        method: row.method,
        path: row.path,
        status: row.status,
        exitCode: row.exitCode,
        durationMs: row.durationMs,
        stdoutPreview: row.stdoutPreview,
        error: row.error,
        startedAt: row.createdAt,
        finishedAt: row.finishedAt,
      })),
    });
  }

  return res.json({
    source: "memory",
    online: isAgentOnline(machineId),
    deployments: listDeployments(machineId, limit),
    invocations: listInvocations(machineId, limit),
  });
});

export default router;
