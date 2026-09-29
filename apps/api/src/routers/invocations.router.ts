import { Router } from "express";
import express from "express";
import { requireUser } from "../lib/auth";
import {
  listMyInvocations,
  postInvocationResult,
} from "../controllers/invocations.controller";

const router = Router();

// Generous JSON limit: stdout travels base64 and the executor caps it at
// 4MB (~5.4MB encoded).
router.use(express.json({ limit: "10mb" }));

router.get("/", requireUser, listMyInvocations);
// Agent-facing: the worker has no user session, this stays public.
router.post("/:invocationId/result", postInvocationResult);

export default router;
