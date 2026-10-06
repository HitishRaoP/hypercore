import type { Request, Response } from "express";
import type { DeploymentRow } from "@hypercore/db/schema/deployments";
import { sendError } from "../lib/errors";
import { getDeploymentById, getLatestBuiltDeployment } from "../services/deployment.service";
import { invokeOnAgent, type AgentInvokeResult } from "../services/invocation.service";

/**
 * Serving Plane: user-facing function URLs executed on the owning agent.
 *
 *   /invoke/:deploymentId — immutable per-deployment URL
 *   /w/:workerName        — stable alias, latest *built* deployment
 *
 * Each hit is forwarded to the deployment's agent over its open SSE stream;
 * the agent runs the wasm locally and POSTs the result back, which releases
 * the waiting HTTP response. The server never executes wasm itself.
 */

function subPath(req: Request, stripPrefix: RegExp): string {
  const path = req.originalUrl.split("?")[0] ?? "/";
  const rest = (req.params as { rest?: string | string[] }).rest;
  if (rest !== undefined) {
    const joined = Array.isArray(rest) ? rest.join("/") : rest;
    return `/${joined}`;
  }
  return path.replace(stripPrefix, "") || "/";
}

function decodeStdout(result: AgentInvokeResult): Buffer {
  if (result.stdoutB64) {
    try {
      return Buffer.from(result.stdoutB64, "base64");
    } catch {
      // fall through to the plain-text field
    }
  }
  return Buffer.from(result.stdout ?? "", "utf8");
}

async function serve(record: DeploymentRow, functionPath: string, req: Request, res: Response) {
  if (!record.artifactKey) {
    return res.status(409).json({
      error: "wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)",
      status: record.status,
      deploymentId: record.id,
      workerName: record.workerName,
    });
  }

  const query = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1)
    : "";
  const body = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;

  const outcome = await invokeOnAgent({
    machineId: record.machineId,
    userId: record.userId ?? null,
    deploymentId: record.id,
    workerName: record.workerName,
    artifactKey: record.artifactKey,
    method: req.method,
    path: functionPath.slice(0, 2000),
    query: query.slice(0, 2000),
    bodyB64: body?.length ? body.toString("base64") : undefined,
  });

  res.setHeader("x-hypercore-deployment", record.id);
  res.setHeader("x-hypercore-worker", record.workerName);

  if (!outcome.delivered) {
    res.setHeader("x-hypercore-node", record.machineId);
    return res.status(503).json({
      error: "Node is offline (no open SSE stream)",
      machineId: record.machineId,
      deploymentId: record.id,
      fallbackAttempted: outcome.fallbackAttempted,
      fallbackCandidates: outcome.fallbackCandidates,
    });
  }

  // Fallback responses are attributed to the node that actually executed.
  res.setHeader("x-hypercore-node", outcome.servedBy);
  if (outcome.fallback) {
    res.setHeader("x-hypercore-fallback", "true");
    res.setHeader("x-hypercore-owner", record.machineId);
  }

  if (outcome.timeout) {
    return res.status(504).json({
      error: "Node did not respond in time",
      servedBy: outcome.servedBy,
      fallback: outcome.fallback,
    });
  }

  const result = outcome.result;
  if (!result.ok || result.code !== 0) {
    return res.status(502).json({
      error: result.error ?? `Function exited with code ${result.code}`,
      stdout: decodeStdout(result).toString("utf8").slice(0, 1000),
      stderr: result.stderr ?? "",
      ...(outcome.fallback ? { servedBy: outcome.servedBy, fallback: true } : {}),
    });
  }
  res.setHeader("x-hypercore-exit-code", "0");
  return res.type("text/plain").send(decodeStdout(result));
}

export async function invokeByDeploymentId(req: Request, res: Response): Promise<Response | void> {
  try {
    const deploymentId = req.params.deploymentId as string;
    const record = await getDeploymentById(deploymentId);
    if (!record) return res.status(404).json({ error: "Unknown deployment" });
    return serve(record, subPath(req, new RegExp(`^/invoke/${deploymentId}`)), req, res);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function invokeByWorkerName(req: Request, res: Response): Promise<Response | void> {
  try {
    const workerName = req.params.workerName as string;
    const record = await getLatestBuiltDeployment(workerName);
    if (!record) return res.status(404).json({ error: "No built deployment for this worker yet" });
    return serve(record, subPath(req, new RegExp(`^/w/${encodeURIComponent(workerName)}`)), req, res);
  } catch (error) {
    return sendError(res, error);
  }
}
