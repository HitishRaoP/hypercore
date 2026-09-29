import { Router } from "express";
import express from "express";
import { invokeByDeploymentId, invokeByWorkerName } from "../controllers/invoke.controller";

// Bodies stay raw bytes (function stdin) instead of being JSON-parsed.
const rawBody = express.raw({ type: "*/*", limit: "1mb" });

/** Immutable per-deployment URL: /invoke/:deploymentId */
export const invokeRouter = Router();
invokeRouter.use(rawBody);
invokeRouter.all(["/:deploymentId", "/:deploymentId/*rest"], invokeByDeploymentId);

/** Stable worker URL: /w/:workerName serves the latest *built* deployment. */
export const workerRouter = Router();
workerRouter.use(rawBody);
workerRouter.all(["/:workerName", "/:workerName/*rest"], invokeByWorkerName);
