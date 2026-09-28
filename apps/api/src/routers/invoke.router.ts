import { Router, type Request, type Response } from "express";
import express from "express";
import { getDeployment, getLatestByWorkerName, type DeploymentRecord } from "../lib/store";
import { invokeOnAgent, type AgentInvokeResult } from "../lib/invocations";

/**
 * Serving Plane: user-facing function URLs executed on the owning agent.
 *
 *   GET|POST|… /invoke/:deploymentId[/*]  — immutable per-deployment URL
 *   GET|POST|… /w/:workerName[/*]         — stable alias, latest *built* deployment
 *
 * Each hit is forwarded to the deployment's agent over its open SSE stream
 * (`event: invoke`); the agent runs the wasm locally (wasmtime) and POSTs
 * the result back to /invocations/:id/result, which releases the waiting
 * HTTP response. The server never executes wasm itself.
 */

function subPath(req: Request, stripPrefix: RegExp) {
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
      // fall through to plain-text field
    }
  }
  return Buffer.from(result.stdout ?? "", "utf8");
}

async function serve(record: DeploymentRecord, hcPath: string, req: Request, res: Response) {
  if (!record.artifactKey) {
    return res.status(409).json({
      error: "wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)",
      status: record.status,
      deploymentId: record.deploymentId,
      workerName: record.workerName,
    });
  }

  const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "";
  const body = Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined;

  const outcome = await invokeOnAgent({
    machineId: record.machineId,
    deploymentId: record.deploymentId,
    workerName: record.workerName,
    artifactKey: record.artifactKey,
    method: req.method,
    path: hcPath.slice(0, 2000),
    query: query.slice(0, 2000),
    bodyB64: body && body.length ? body.toString("base64") : undefined,
  });

  res.setHeader("x-hypercore-deployment", record.deploymentId);
  res.setHeader("x-hypercore-worker", record.workerName);
  res.setHeader("x-hypercore-node", record.machineId);

  if (!outcome.delivered) {
    return res.status(503).json({
      error: "Node is offline (no open SSE stream)",
      machineId: record.machineId,
      deploymentId: record.deploymentId,
    });
  }
  if (outcome.timeout) {
    return res.status(504).json({ error: "Node did not respond in time" });
  }

  const result = outcome.result;
  if (!result.ok || result.code !== 0) {
    return res.status(502).json({
      error: result.error ?? `Function exited with code ${result.code}`,
      stdout: decodeStdout(result).toString("utf8").slice(0, 1000),
      stderr: result.stderr ?? "",
    });
  }
  res.setHeader("x-hypercore-exit-code", "0");
  return res.type("text/plain").send(decodeStdout(result));
}

const rawBody = express.raw({ type: "*/*", limit: "1mb" });

export const invokeRouter = Router();
invokeRouter.use(rawBody);
invokeRouter.all(["/:deploymentId", "/:deploymentId/*rest"], async (req, res) => {
  const deploymentId = req.params.deploymentId as string;
  const record = getDeployment(deploymentId);
  if (!record) return res.status(404).json({ error: "Unknown deployment" });
  return serve(record, subPath(req, new RegExp(`^/invoke/${deploymentId}`)), req, res);
});

export const workerRouter = Router();
workerRouter.use(rawBody);
workerRouter.all(["/:workerName", "/:workerName/*rest"], async (req, res) => {
  const workerName = req.params.workerName as string;
  const record = getLatestByWorkerName(workerName);
  if (!record) {
    return res.status(404).json({ error: "No built deployment for this worker yet" });
  }
  return serve(record, subPath(req, new RegExp(`^/w/${encodeURIComponent(workerName)}`)), req, res);
});
