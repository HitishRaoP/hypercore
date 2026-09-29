import { Router } from "express";
import { getActivityByMachine } from "../controllers/activity.controller";

const router = Router();

router.get("/", getActivityByMachine);

export default router;
