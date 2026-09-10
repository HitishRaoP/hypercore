import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "Hypercore api is up!" });
});

export { app };
