import "dotenv/config";
import express from "express";
import cors from "cors";
import codeUploadRouter from "./routers/code-upload.router";
import router from "./routers/rabbitmq.router";
import { connectRabbitMQ } from "./lib/rabbitmq";

const app = express();

app.use(cors());

app.use(express.json());

await connectRabbitMQ();

app.use("/code-upload", codeUploadRouter);

app.use("/deployment", router)

app.get("/", (req, res) => {
  res.json({ message: "Hypercore api is up!" });
});

export { app };
