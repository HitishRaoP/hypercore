import "dotenv/config";
import express from "express";
import cors from "cors";
import codeUploadRouter from "./routers/code-upload.router";
import deploymentRouter from "./routers/deployment.router";
import agentsRouter from "./routers/agents.router";
import { invokeRouter, workerRouter } from "./routers/invoke.router";

const app = express();

app.use(cors());

// Serving Plane mounts BEFORE express.json(): invoke bodies stay raw bytes
// (function stdin) instead of being JSON-parsed.
app.use("/invoke", invokeRouter);
app.use("/w", workerRouter);

app.use(express.json());

app.use("/code-upload", codeUploadRouter);

app.use("/deployment", deploymentRouter);

app.use("/agents", agentsRouter);

app.get("/", (req, res) => {
  res.json({ message: "Hypercore api is up!" });
});

export { app };
