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

/**
 * Origins allowed to call the API from a browser.
 *
 * The agent is a Tauri app and every platform's WebView reports a *different*
 * origin for the very same bundle:
 *   - Windows (WebView2): `http://tauri.localhost`
 *   - macOS / Linux:     `tauri://localhost`
 * `tauri dev` doesn't use either — it loads the Vite dev server on :1420.
 * The list below used to carry only `https://tauri.localhost`, which matches no
 * real WebView, so Windows agents were dropped by the browser with a CORS error
 * while macOS ones kept working.
 *
 * Everything else comes from `CORS_ORIGINS` (comma-separated), so adding a
 * tunnel host, a public dashboard, or a LAN dev box is a restart of the API
 * instead of a code change. `*` reflects any origin and drops credentials.
 */
const DEFAULT_ORIGINS = [
  // Tauri release builds — keep both schemes, one per platform family.
  "http://tauri.localhost", // Windows / WebView2
  "tauri://localhost", // macOS + Linux
  // Dashboard and agent dev servers.
  "http://localhost:3000",
  "http://localhost:1420",
];

/** Browsers always send a scheme://host[:port] with no trailing slash. */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

/** What `cors` accepts here: a wildcard, or an explicit allowlist. */
type CorsAllowlist = "*" | (string | RegExp)[];

function resolveCorsOrigins(): CorsAllowlist {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  if (extra.includes("*")) return "*";

  const origins = new Set(DEFAULT_ORIGINS.map(normalizeOrigin));
  for (const origin of extra) origins.add(origin);
  // `DASHBOARD_URL` is often written with a trailing slash in .env; cors
  // compares by exact string, so it has to be normalized to ever match.
  const dashboard = normalizeOrigin(process.env.DASHBOARD_URL ?? "");
  if (dashboard) origins.add(dashboard);
  // Loopback on any port: dev servers pick their own, and a loopback origin can
  // neither be spoofed by a remote page nor reached from the public internet.
  return [...origins, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
}

const corsOrigins = resolveCorsOrigins();
const allowAnyOrigin = corsOrigins === "*";

console.log(
  `[cors] allowed origins: ${
    allowAnyOrigin
      ? "* (any origin, credentials off)"
      : (corsOrigins as (string | RegExp)[]).join(", ")
  }`,
);

app.use(cors({
  origin: corsOrigins,
  credentials: !allowAnyOrigin,
}));

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
