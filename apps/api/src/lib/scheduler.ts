import type { Response } from "express";

/**
 * In-memory scheduler hub (Message Plane replacement for RabbitMQ).
 *
 * Each HC Agent opens ONE long-lived outbound SSE connection:
 *
 *   GET /agents/events?machineId=<machine-id>
 *
 * The scheduler keeps that HTTP response open and routes a deployment
 * to a specific agent by writing an SSE event into that agent's stream:
 *
 *   event: deployment
 *   data: {"deploymentId":"...","machineId":"...","objectKey":"..."}
 *
 * Why this removes agent-side credentials:
 * - The agent never connects to RabbitMQ, so no CLOUDAMQP_URL /
 *   exchange / queue credentials have to be shipped with the installer.
 * - The agent only needs the coordinator (API) base URL, which the user
 *   types in at install/register time. It is a plain outbound HTTPS
 *   connection, so it works behind NAT with no inbound ports.
 * - Routing state (which machineId -> which open stream) lives
 *   server-side in the scheduler, exactly as requested.
 */

export interface DeploymentFileRef {
  name: string;
  key: string;
}

export interface DeploymentPayload {
  deploymentId: string;
  machineId: string;
  objectKey: string;
  workerName?: string;
  entrypoint?: string;
  files?: DeploymentFileRef[];
}

type AgentConnection = {
  res: Response;
  heartbeat: NodeJS.Timeout;
};

const agents = new Map<string, AgentConnection>();

function sseWrite(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
}

export function addAgent(machineId: string, res: Response) {
  // One active stream per machine. Replace a stale stream on reconnect.
  removeAgent(machineId);

  // Keep proxies / load-balancers from buffering the stream.
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 25_000);

  agents.set(machineId, { res, heartbeat });
  console.log(`[scheduler] agent connected: ${machineId} (online: ${agents.size})`);
}

export function removeAgent(machineId: string) {
  const existing = agents.get(machineId);
  if (!existing) return;
  clearInterval(existing.heartbeat);
  agents.delete(machineId);
  console.log(`[scheduler] agent disconnected: ${machineId} (online: ${agents.size})`);
}

export function isAgentOnline(machineId: string) {
  return agents.has(machineId);
}

export function listOnlineAgents() {
  return [...agents.keys()];
}

/**
 * Scheduler routing: deliver a deployment to exactly one agent.
 * Returns false when the target agent has no open SSE stream.
 */
export function pushDeployment(payload: DeploymentPayload) {
  const conn = agents.get(payload.machineId);
  if (!conn) return false;
  try {
    sseWrite(conn.res, "deployment", payload);
    console.log(
      `[scheduler] routed deployment ${payload.deploymentId} -> ${payload.machineId}`,
    );
    return true;
  } catch (error) {
    console.error(`[scheduler] failed to route to ${payload.machineId}:`, error);
    removeAgent(payload.machineId);
    return false;
  }
}
