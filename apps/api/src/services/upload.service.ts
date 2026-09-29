import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { HttpError } from "../lib/errors";
import { R2_BUCKET, S3, rawKeyFor } from "../lib/s3";

/**
 * Code-upload flow: validate the multipart bundle, store raw sources in R2
 * (raw/{deploymentId}/{file}), and serve them back to agents via the R2
 * proxy. Deployment/table writes live in deployment.service.
 */

// ---------------------------------------------------------------------------
// Template (single source of truth for the dashboard template + curl users)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ALLOWED_RE = /^(index|function|worker)\.ts$|^package\.json$|^bun\.lockb?$|^.+\.ts$/i;

export function sanitizeFileName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Validates the bundle fields; returns the sanitized file names. */
export function validateUploadInput(
  workerName: string,
  machineId: string,
  files: Express.Multer.File[],
): string[] {
  if (!workerName) throw new HttpError(400, "workerName is required");
  if (!machineId) throw new HttpError(400, "machineId is required (pick a target node)");
  if (!files.length) {
    throw new HttpError(400, "files[] is required (ts entrypoint + package.json + bun.lock)");
  }
  const names = files.map((file) => sanitizeFileName(file.originalname));
  if (!names.some((name) => name.endsWith(".ts"))) {
    throw new HttpError(400, "A .ts function file (e.g. index.ts) is required");
  }
  if (!names.includes("package.json")) throw new HttpError(400, "package.json is required");
  for (const name of names) {
    if (!ALLOWED_RE.test(name)) {
      throw new HttpError(
        400,
        `File not allowed: ${name}. Upload a .ts entrypoint, package.json and bun.lock[b].`,
      );
    }
  }
  return names;
}

/** Picks the entrypoint file, falling back to the first .ts file. */
export function resolveEntrypoint(names: string[], requested: string): string {
  const clean = sanitizeFileName(requested || "index.ts");
  if (names.includes(clean)) return clean;
  const fallback = names.find((name) => name.endsWith(".ts"));
  if (!fallback) throw new HttpError(400, "A .ts function file (e.g. index.ts) is required");
  return fallback;
}

// ---------------------------------------------------------------------------
// R2 raw storage
// ---------------------------------------------------------------------------

export interface RawStoredFile {
  name: string;
  key: string;
  size: number;
  contentType?: string;
}

export async function storeRawFiles(
  deploymentId: string,
  files: Express.Multer.File[],
  names: string[],
): Promise<RawStoredFile[]> {
  const stored: RawStoredFile[] = [];
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
  return stored;
}

// ---------------------------------------------------------------------------
// R2 proxy (agents hold no R2 credentials)
// ---------------------------------------------------------------------------

export function assertReadableKey(key: string): void {
  if (!key || (!key.startsWith("raw/") && !key.startsWith("artifacts/"))) {
    throw new HttpError(400, "key must start with raw/ or artifacts/");
  }
}

export async function fetchRawObject(key: string) {
  try {
    return await S3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    throw new HttpError(404, "Object not found in R2");
  }
}
