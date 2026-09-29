import "dotenv/config";
import express from "express";
import cors from "cors";
import codeUploadRouter from "./routers/code-upload.router";
import deploymentRouter from "./routers/deployment.router";
import agentsRouter from "./routers/agents.router";
import activityRouter from "./routers/activity.router";
import invocationsRouter from "./routers/invocations.router";
import nodesRouter from "./routers/nodes.router";
import { invokeRouter, workerRouter } from "./routers/invoke.router";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@hypercore/auth";

const app = express();

app.use(cors({
  origin: [
    process.env.DASHBOARD_URL ?? "http://localhost:3000",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://localhost:1420",
  ],
  credentials: true,
}));

// Serving Plane mounts BEFORE express.json(): invoke bodies stay raw bytes
// (function stdin) instead of being JSON-parsed. The agent result callback
// carries its own 10mb JSON parser (stdout travels base64).
app.use("/invoke", invokeRouter);
app.use("/w", workerRouter);

app.use("/invocations", invocationsRouter);

app.use("/agents", agentsRouter);

app.use("/activity", activityRouter);

// Versioned node registry — the agent POSTs { machine } here on register.
app.use("/api/v1/nodes", nodesRouter);

app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());

app.use("/code-upload", codeUploadRouter);

app.use("/deployment", deploymentRouter);

app.get("/", (req, res) => {
  res.json({ message: "Hypercore api is up!" });
});

export { app };
