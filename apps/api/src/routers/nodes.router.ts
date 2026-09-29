import { Router } from "express";
import { getNode, listNodes, registerNode } from "../controllers/nodes.controller";

const router = Router();

router.post("/register", registerNode);
router.get("/", listNodes);
router.get("/:machineId", getNode);

export default router;
