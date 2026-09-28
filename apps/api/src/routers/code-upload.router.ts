import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { R2_BUCKET, rawKeyFor, S3 } from "../lib/s3";
import { pushDeployment } from "../lib/scheduler";
import { getDeployment, saveDeployment } from "../lib/store";
import { invokeUrlFor, workerUrlFor } from "../lib/urls";

const router = Router();

// Keep raw sources in memory, then PUT each file to R2 via the S3 SDK.
// (multer-s3 only handles a single file and hides keys/metadata from us.)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

const ALLOWED_RE = /^(index|function|worker)\.ts$|^package\.json$|^bun\.lockb?$|^.+\.ts$/i;

function sanitize(name: string) {
  return name.replace(/\\/g, "/").split("/").pop()!.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Minimal hello-world bundle (single source of truth for the dashboard
 * template and for curl users). Files:
 *   index.ts      — TS function entrypoint
 *   package.json  — bun project manifest
 *   bun.lock      — minimal lockfile placeholder
 */
export const HELLO_WORLD = {
  entrypoint: "index.ts",
  files: [
    {
      name: "index.ts",
      content: `// HyperCore worker entrypoint — TS -> (esbuild) -> JS -> (javy) -> wasm\n\nexport function handler(): string {\n  return "Hello, World!";\n}\n\n// Javy/QuickJS entrypoint: keep a side-effectful root so the\n// compiled wasm module prints hello on instantiation.\nconsole.log(handler());\n`,
    },
    {
      name: "package.json",
      content: `{\n  "name": "hypercore-hello-world",\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "build": "esbuild index.ts --bundle --format=esm --platform=neutral --outfile=bundle.js"\n  },\n  "devDependencies": {\n    "esbuild": "^0.21.0"\n  }\n}\n`,
    },
    {
      name: "bun.lock",
      content: `{\n  "lockfileVersion": 1,\n  "workspaces": {\n    "": {\n      "name": "hypercore-hello-world",\n      "dependencies": {}\n    }\n  },\n  "packages": {}\n}\n`,
    },
  ],
};

router.get("/template", (_req, res) => {
  return res.json(HELLO_WORLD);
});

/**
 * POST /code-upload
 * multipart/form-data:
 *   workerName: string, machineId: string, entrypoint?: string
 *   files: File[] (index.ts/function.ts/worker.ts + package.json + bun.lock[b])
 *
 * Flow: validate -> PUT each file to R2 (raw/{deploymentId}/{file})
 * -> save metadata -> route to node via scheduler (SSE).
 */
router.post("/", upload.array("files", 10), async (req, res) => {
  try {
    const workerName = String(req.body?.workerName ?? "").trim();
    const machineId = String(req.body?.machineId ?? "").trim();
    let entrypoint = String(req.body?.entrypoint ?? "index.ts").trim() || "index.ts";
    const files = (req.files ?? []) as Express.Multer.File[];

    if (!workerName) return res.status(400).json({ error: "workerName is required" });
    if (!machineId) return res.status(400).json({ error: "machineId is required (pick a target node)" });
    if (!files.length) return res.status(400).json({ error: "files[] is required (ts entrypoint + package.json + bun.lock)" });

    const names = files.map((f) => sanitize(f.originalname));
    const hasTs = names.some((n) => n.endsWith(".ts"));
    const hasPkg = names.some((n) => n === "package.json");
    if (!hasTs) return res.status(400).json({ error: "A .ts function file (e.g. index.ts) is required" });
    if (!hasPkg) return res.status(400).json({ error: "package.json is required" });
    for (const n of names) {
      if (!ALLOWED_RE.test(n)) {
        return res.status(400).json({ error: `File not allowed: ${n}. Upload a .ts entrypoint, package.json and bun.lock[b].` });
      }
    }
    entrypoint = sanitize(entrypoint);
    if (!names.includes(entrypoint)) {
      const fallback = names.find((n) => n.endsWith(".ts"))!;
      entrypoint = fallback;
    }

    const deploymentId = uuidv4();
    const stored: { name: string; key: string; size: number; contentType?: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const name = names[i]!;
      const key = rawKeyFor(deploymentId, name);
      await S3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || "application/octet-stream",
        }),
      );
      stored.push({ name, key, size: file.size, contentType: file.mimetype });
    }

    const entry = stored.find((f) => f.name === entrypoint) ?? stored[0]!;

    saveDeployment({
      deploymentId,
      workerName,
      machineId,
      entrypoint: entry.name,
      files: stored,
      status: "uploaded",
      createdAt: new Date().toISOString(),
    });

    const delivered = pushDeployment({
      deploymentId,
      machineId,
      objectKey: entry.key,
      workerName,
      entrypoint: entry.name,
      files: stored.map(({ name, key }) => ({ name, key })),
    });

    const { updateDeployment } = await import("../lib/store");
    updateDeployment(deploymentId, { status: delivered ? "routed" : "offline" });

    return res.status(202).json({
      status: delivered ? "routed" : "offline",
      deploymentId,
      workerName,
      machineId,
      entrypoint: entry.name,
      files: stored,
      invokeUrl: invokeUrlFor(deploymentId),
      workerUrl: workerUrlFor(workerName),
      ...(delivered ? {} : { error: "Target agent is not connected (no open SSE stream)" }),
    });
  } catch (error) {
    console.error("code-upload failed:", error);
    return res.status(500).json({ error: "Upload to R2 failed" });
  }
});

/**
 * GET /code-upload/file?key=raw/... — R2 proxy so agents need no R2
 * credentials. Only raw/ and artifacts/ prefixes are readable.
 * NOTE: defined before /:deploymentId/files so "/file" is not captured
 * as a deploymentId.
 */
router.get("/file", async (req, res) => {
  try {
    const key = String(req.query.key ?? "");
    if (!key || (!key.startsWith("raw/") && !key.startsWith("artifacts/"))) {
      return res.status(400).json({ error: "key must start with raw/ or artifacts/" });
    }
    const out = await S3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (out.ContentType) res.setHeader("Content-Type", out.ContentType);
    if (out.ContentLength) res.setHeader("Content-Length", String(out.ContentLength));
    if (out.ETag) res.setHeader("ETag", out.ETag);
    const body = out.Body as unknown as NodeJS.ReadableStream | undefined;
    if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
      (body as NodeJS.ReadableStream).pipe(res);
      return undefined;
    }
    // Fallback: SDK v3 may return a web stream / buffer.
    const bytes = await (out.Body as { transformToByteArray?: () => Promise<Uint8Array> })?.transformToByteArray?.();
    if (bytes) return res.send(Buffer.from(bytes));
    return res.status(500).json({ error: "Unreadable R2 object" });
  } catch (error) {
    console.error("R2 proxy failed:", error);
    return res.status(404).json({ error: "Object not found in R2" });
  }
});

/** GET /code-upload/:deploymentId/files — manifest the agent pulls. */
router.get("/:deploymentId/files", (req, res) => {
  const deploymentId = req.params.deploymentId as string;
  const record = getDeployment(deploymentId);
  if (!record) return res.status(404).json({ error: "Unknown deploymentId" });
  return res.json(record);
});

export default router;
