import { Router } from "express";
import {
	getStatus,
	listOnline,
	streamEvents,
} from "../controllers/agents.controller";

const router = Router();

router.get("/events", streamEvents);
router.get("/online", listOnline);
router.get("/status", getStatus);

export default router;
