import type { Request, Response } from "express";
import { addAgent, isAgentOnline, listOnlineAgents, removeAgent } from "../lib/scheduler";

/**
 * Agent subscribes to its deployment stream. Outbound-only from the agent's
 * perspective — no broker credentials, no inbound ports.
 *
 *   GET /agents/events?machineId=<machine-id>
 */
export function streamEvents(req: Request, res: Response): void {
  const machineId = String(req.query.machineId ?? "").trim();
  if (!machineId) {
    res.status(400).json({ error: "machineId query param is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // Flush headers immediately so the agent knows it is subscribed.
  res.flushHeaders?.();

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ machineId, online: true })}\n\n`);

  addAgent(machineId, res);

  const cleanup = () => removeAgent(machineId);
  req.on("close", cleanup);
  req.on("error", cleanup);

  // Do not end the response — the scheduler writes into it per deployment.
}

/** Scheduler introspection: which agents currently hold an SSE stream. */
export function listOnline(_req: Request, res: Response): Response {
  const online = listOnlineAgents();
  return res.json({ online, count: online.length });
}

/** Convenience probe used by the agent UI after registration. */
export function getStatus(req: Request, res: Response): Response {
  const machineId = String(req.query.machineId ?? "").trim();
  if (!machineId) return res.status(400).json({ error: "machineId query param is required" });
  return res.json({ machineId, online: isAgentOnline(machineId) });
}
