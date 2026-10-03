import express, { Router } from "express";
import { getNode, listNodes, registerNode } from "../controllers/nodes.controller";

const router = Router();

// app.ts mounts express.json() after /api/v1/nodes (auth + raw invoke
// routes must stay before the global parser), so parse JSON here.
// Without this req.body is undefined and register always 400s while
// SSE connect still succeeds.
router.use(express.json());

router.post("/register", registerNode);
router.get("/", listNodes);
router.get("/:machineId", getNode);

export default router;
