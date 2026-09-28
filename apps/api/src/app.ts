import "dotenv/config";
import express from "express";
import cors from "cors";
import codeUploadRouter from "./routers/code-upload.router";
import deploymentRouter from "./routers/deployment.router";
import agentsRouter from "./routers/agents.router";

const app = express();

app.use(cors());

app.use(express.json());

app.use("/code-upload", codeUploadRouter);

app.use("/deployment", deploymentRouter);

app.use("/agents", agentsRouter);

app.get("/", (req, res) => {
  res.json({ message: "Hypercore api is up!" });
});

export { app };
