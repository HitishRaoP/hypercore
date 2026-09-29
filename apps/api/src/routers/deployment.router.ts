import { Router } from "express";
import multer from "multer";
import {
  acknowledgeDeployment,
  routeDeployment,
  uploadArtifact,
} from "../controllers/deployment.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post("/", routeDeployment);
router.post("/:deploymentId/artifact", upload.single("wasm"), uploadArtifact);
router.post("/:deploymentId/ack", acknowledgeDeployment);

export default router;
