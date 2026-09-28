import { Router, type Request, type Response } from "express";
import express from "express";
import { getDeployment, getLatestByWorkerName, type DeploymentRecord } from "../lib/store";
import { fetchArtifactBytes, runWasm } from "../lib/wasm-runner";

/**
 * Serving Plane: user-facing function URLs backed by the wasm artifact in R2.
 *
 *   GET|POST|… /invoke/:deploymentId[/*]  — immutable per-deployment URL
 *   GET|POST|… /w/:workerName[/*]         — stable alias, latest *built* deployment
 *
 * Each hit pulls the artifact from R2 (cached in memory), runs it in an
 * isolated worker thread with a timeout, and returns the module's stdout as
 * `text/plain`. Request context reaches the module via WASI env
 * (HC_METHOD/HC_PATH/HC_QUERY) and stdin (raw body, ≤1MB).
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

async function serve(record: DeploymentRecord, hcPath: string, req: Request, res: Response) {
  if (!record.artifactKey) {
    return res.status(409).json({
      error: "wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)",
      status: record.status,
      deploymentId: record.deploymentId,
      workerName: record.workerName,
    });
  }

  let wasm: Buffer;
  try {
    wasm = await fetchArtifactBytes(record);
  } catch (error) {
    console.error("invoke: artifact fetch failed:", error);
    return res.status(502).json({ error: "Failed to load wasm artifact from R2" });
  }

  const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?") + 1) : "";
  const result = await runWasm(wasm, {
    env: {
      HC_METHOD: req.method,
      HC_PATH: hcPath.slice(0, 2000),
      HC_QUERY: query.slice(0, 2000),
    },
    stdin: Buffer.isBuffer(req.body) ? (req.body as Buffer) : undefined,
  });

  res.setHeader("x-hypercore-deployment", record.deploymentId);
  res.setHeader("x-hypercore-worker", record.workerName);

  if (result.timedOut) return res.status(504).json({ error: result.error });
  if (!result.ok || result.code !== 0) {
    return res.status(502).json({
      error: result.error ?? `Function exited with code ${result.code}`,
      stdout: result.stdout.slice(0, 1000),
      stderr: result.stderr ?? "",
    });
  }
  res.setHeader("x-hypercore-exit-code", "0");
  return res.type("text/plain").send(result.stdout);
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
