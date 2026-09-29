import { Router } from "express";
import express from "express";
import { postInvocationResult } from "../controllers/invocations.controller";

const router = Router();

// Generous JSON limit: stdout travels base64 and the executor caps it at
// 4MB (~5.4MB encoded).
router.use(express.json({ limit: "10mb" }));

router.post("/:invocationId/result", postInvocationResult);

export default router;
