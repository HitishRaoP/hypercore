import { Router } from "express";
import multer from "multer";
import {
	checkWorkerNameAvailability,
	getDeploymentFiles,
	getTemplate,
	proxyFile,
	uploadCode,
} from "../controllers/code-upload.controller";
import { requireUser } from "../lib/auth";

// Keep raw sources in memory, then PUT each file to R2 via the S3 SDK.
// (multer-s3 only handles a single file and hides keys/metadata from us.)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

const router = Router();

router.get("/template", getTemplate);
router.get("/check-name", checkWorkerNameAvailability);
// Dashboard-only: stamps the owner's userId, so it needs a user session.
router.post("/", requireUser, upload.array("files", 10), uploadCode);
// Agent-facing: the worker has no user session, these stay public.
// NOTE: /file is defined before /:deploymentId/files so it isn't captured as an id.
router.get("/file", proxyFile);
router.get("/:deploymentId/files", getDeploymentFiles);

export default router;
