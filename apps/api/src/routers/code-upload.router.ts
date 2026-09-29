import { Router } from "express";
import multer from "multer";
import {
  getDeploymentFiles,
  getTemplate,
  proxyFile,
  uploadCode,
} from "../controllers/code-upload.controller";

// Keep raw sources in memory, then PUT each file to R2 via the S3 SDK.
// (multer-s3 only handles a single file and hides keys/metadata from us.)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

const router = Router();

router.get("/template", getTemplate);
router.post("/", upload.array("files", 10), uploadCode);
// NOTE: /file is defined before /:deploymentId/files so it isn't captured as an id.
router.get("/file", proxyFile);
router.get("/:deploymentId/files", getDeploymentFiles);

export default router;
