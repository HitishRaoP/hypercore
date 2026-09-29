import { Router } from "express";
import multer from "multer";
import { requireUser } from "../lib/auth";
import {
  acknowledgeDeployment,
  listMyDeployments,
  routeDeployment,
  uploadArtifact,
} from "../controllers/deployment.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get("/", requireUser, listMyDeployments);
router.post("/", routeDeployment);
// Agent-facing: the worker has no user session, these stay public.
router.post("/:deploymentId/artifact", upload.single("wasm"), uploadArtifact);
router.post("/:deploymentId/ack", acknowledgeDeployment);

export default router;
