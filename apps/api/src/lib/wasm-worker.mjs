/**
 * wasm-worker.mjs — executes ONE wasm invocation inside a worker thread.
 *
 * Plain `.mjs` (no TypeScript) so it loads unchanged under tsx, node, or a
 * compiled `dist/` layout — it always sits next to `wasm-runner`.
 *
 * Contract (workerData): { wasm: Buffer, stdin: Buffer | null, env: Record<string,string> }
 * Result (parentPort message): { ok, code?, stdout, stderr?, error?, }
 *
 * Request context reaches the module via WASI env (HC_METHOD, HC_PATH,
 * HC_QUERY) and stdin; the module's stdout becomes the HTTP response body.
 */
import { parentPort, workerData } from "node:worker_threads";
import { WASI } from "node:wasi";
import { openSync, readFileSync, statSync, writeFileSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_STDOUT_BYTES = 4_000_000;

const tag = randomUUID();
const outPath = join(tmpdir(), `hc-invoke-${tag}.out`);
const errPath = join(tmpdir(), `hc-invoke-${tag}.err`);
const inPath = workerData.stdin ? join(tmpdir(), `hc-invoke-${tag}.in`) : null;
const outFd = openSync(outPath, "w");
const errFd = openSync(errPath, "w");
let inFd = 0;

try {
  if (inPath) {
    writeFileSync(inPath, Buffer.from(workerData.stdin));
    inFd = openSync(inPath, "r");
  }
  const wasi = new WASI({
    version: "preview1",
    args: [],
    env: workerData.env ?? {},
    stdin: inFd,
    stdout: outFd,
    stderr: errFd,
    returnOnExit: true,
  });

  const mod = await WebAssembly.compile(Buffer.from(workerData.wasm));
  const instance = await WebAssembly.instantiate(mod, wasi.getImportObject());
  const code = wasi.start(instance);

  parentPort.postMessage({
    ok: true,
    code,
    stdout: readOutput(outPath),
    stderr: readFileSync(errPath, "utf8").slice(0, 2000),
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error?.message ?? String(error),
    code: typeof error?.code === "number" ? error.code : undefined,
    stdout: readOutput(outPath),
  });
} finally {
  closeSync(outFd);
  closeSync(errFd);
  if (inFd !== 0) closeSync(inFd);
}

function readOutput(path) {
  try {
    if (statSync(path).size <= MAX_STDOUT_BYTES) return readFileSync(path, "utf8");
    return "";
  } catch {
    return "";
  }
}
