import { Worker } from "node:worker_threads";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";
import { R2_BUCKET, S3 } from "./s3";
import type { DeploymentRecord } from "./store";

/** In-memory artifact cache: deploymentId -> wasm bytes (avoids R2 per hit). */
const cache = new Map<string, Buffer>();
const MAX_CACHED = 50;

export function invalidateArtifactCache(deploymentId: string) {
  cache.delete(deploymentId);
}

/** Dev/test helper: serve invocations without touching R2. */
export function primeArtifactCache(deploymentId: string, wasm: Buffer) {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(deploymentId, wasm);
}

export async function fetchArtifactBytes(record: DeploymentRecord): Promise<Buffer> {
  const hit = cache.get(record.deploymentId);
  if (hit) return hit;
  if (!record.artifactKey) throw new Error("Deployment has no wasm artifact yet");
  const out = await S3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: record.artifactKey }));
  const body = out.Body as unknown as { transformToByteArray: () => Promise<Uint8Array> };
  const buf = Buffer.from(await body.transformToByteArray());
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(record.deploymentId, buf);
  return buf;
}

export interface InvokeInput {
  env: Record<string, string>;
  stdin?: Buffer;
  timeoutMs?: number;
}

export interface InvokeResult {
  ok: boolean;
  code?: number;
  stdout: string;
  stderr?: string;
  error?: string;
  timedOut?: boolean;
}

/**
 * Run wasm bytes in an isolated worker thread with a wall-clock timeout.
 * A hung/infinite-looping module terminates the worker instead of blocking
 * the API event loop.
 */
export function runWasm(wasm: Buffer, input: InvokeInput): Promise<InvokeResult> {
  const timeoutMs = input.timeoutMs ?? env.INVOKE_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: InvokeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const worker = new Worker(new URL("./wasm-worker.mjs", import.meta.url), {
      workerData: { wasm, stdin: input.stdin ?? null, env: input.env },
    });
    const timer = setTimeout(() => {
      done({ ok: false, stdout: "", timedOut: true, error: `Function timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    worker.once("message", (msg) => done(msg as InvokeResult));
    worker.once("error", (error: Error) => done({ ok: false, stdout: "", error: error.message }));
    worker.once("exit", (code) => {
      if (!settled && code !== 0) done({ ok: false, stdout: "", error: `Worker exited with code ${code}` });
    });
  });
}
