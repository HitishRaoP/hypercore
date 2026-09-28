#!/usr/bin/env node
/**
 * fetch-tools.mjs — install the agent's build toolchain.
 *
 * Downloads pinned `javy` (JS -> wasm) and `esbuild` (TS -> JS) binaries for
 * the *host* platform into `../src-tauri/resources/tools/`, where
 * `tauri.conf.json > bundle.resources` picks them up so they ship inside the
 * agent installer/exe. At runtime the agent prefers the bundled copy and
 * falls back to PATH (`src-tauri/src/tools.rs`).
 *
 * Release flow: each per-OS CI job runs `bun run fetch:tools` before
 * `tauri build`, so every installer carries native binaries.
 *
 * Usage:
 *   bun ./scripts/fetch-tools.mjs [--force] [--check] [--tolerant]
 *
 *   --force    re-download even when binaries already exist
 *   --check    verify only (exit 1 when a binary is missing/broken)
 *   --tolerant never fail (for `postinstall`); warn and exit 0
 */
import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const JAVY_VERSION = "9.1.0";
const ESBUILD_VERSION = "0.28.2";

const here = dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = join(here, "..", "src-tauri", "resources", "tools");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const CHECK = args.has("--check");
const TOLERANT = args.has("--tolerant");

const isWindows = process.platform === "win32";
const binName = (base) => (isWindows ? `${base}.exe` : base);

function javyAsset() {
  const arch = process.arch === "arm64" ? "arm" : "x86_64";
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  return `javy-${arch}-${os}-v${JAVY_VERSION}.gz`;
}

function esbuildPkg() {
  const os =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `@esbuild/${os}-${arch}`;
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed ${res.status} ${url}`);
  }
  const file = createWriteStream(dest);
  await finished(Readable.fromWeb(res.body).pipe(file));
}

function runVersion(bin, want) {
  try {
    const out = execFileSync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
    }).trim();
    if (want && !out.includes(want)) {
      throw new Error(`unexpected version output: ${out}`);
    }
    return out.split("\n")[0];
  } catch (error) {
    throw new Error(`${bin} --version failed: ${error.message}`);
  }
}

async function fetchJavy(dest) {
  const asset = javyAsset();
  const url = `https://github.com/bytecodealliance/javy/releases/download/v${JAVY_VERSION}/${asset}`;
  const tmp = await mkdtemp(join(tmpdir(), "hc-javy-"));
  try {
    const gzPath = join(tmp, asset);
    console.log(`[fetch-tools] javy ${JAVY_VERSION}: ${url}`);
    await download(url, gzPath);
    const { readFileSync } = await import("node:fs");
    const raw = gunzipSync(readFileSync(gzPath));
    writeFileSync(dest, raw);
    if (!isWindows) await chmod(dest, 0o755);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function fetchEsbuild(dest) {
  const pkg = esbuildPkg();
  const pkgDir = pkg.replace("@esbuild/", "");
  const url = `https://registry.npmjs.org/${pkg}/-/${pkgDir}-${ESBUILD_VERSION}.tgz`;
  const tmp = await mkdtemp(join(tmpdir(), "hc-esbuild-"));
  try {
    const tgzPath = join(tmp, "esbuild.tgz");
    console.log(`[fetch-tools] esbuild ${ESBUILD_VERSION}: ${url}`);
    await download(url, tgzPath);
    await extractTgz(tgzPath, tmp, `package/${binName("esbuild")}`);
    copyFileSync(join(tmp, "package", binName("esbuild")), dest);
    if (!isWindows) await chmod(dest, 0o755);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function toTarPath(p) {
  // GNU tar treats `C:\...` as a remote host; forward slashes + --force-local
  // avoid that. Unix tars take plain paths.
  return process.platform === "win32" ? p.replace(/\\/g, "/") : p;
}

async function extractTgz(tgzPath, destDir, member) {
  const args =
    process.platform === "win32"
      ? ["--force-local", "-xzf", toTarPath(tgzPath), "-C", toTarPath(destDir), member]
      : ["-xzf", tgzPath, "-C", destDir, member];
  // bsdtar ships with Windows 10+ and exists as `tar` on macOS/Linux.
  execFileSync("tar", args, { stdio: "ignore" });
}

async function ensureTool(base, fetcher, wantVersion) {
  const dest = join(TOOLS_DIR, binName(base));
  if (!FORCE && existsSync(dest)) {
    try {
      const v = runVersion(dest, wantVersion);
      console.log(`[fetch-tools] ${base} already present: ${dest} (${v})`);
      return;
    } catch {
      console.log(`[fetch-tools] ${base} present but broken, re-fetching`);
      rmSync(dest, { force: true });
    }
  }
  mkdirSync(TOOLS_DIR, { recursive: true });
  await fetcher(dest);
  const v = runVersion(dest, wantVersion);
  console.log(`[fetch-tools] ${base} installed: ${dest} (${v})`);
}

async function main() {
  if (CHECK) {
    let ok = true;
    for (const [base, want] of [
      ["esbuild", ESBUILD_VERSION],
      ["javy", JAVY_VERSION],
    ]) {
      const dest = join(TOOLS_DIR, binName(base));
      try {
        const v = runVersion(dest, want);
        console.log(`[fetch-tools] OK ${base}: ${dest} (${v})`);
      } catch (error) {
        console.error(`[fetch-tools] MISSING ${base}: ${error.message}`);
        ok = false;
      }
    }
    if (!ok) process.exit(1);
    return;
  }
  await ensureTool("esbuild", fetchEsbuild, ESBUILD_VERSION);
  await ensureTool("javy", fetchJavy, JAVY_VERSION);
  console.log("[fetch-tools] done — binaries ship via bundle.resources");
}

try {
  await main();
} catch (error) {
  console.error(`[fetch-tools] FAILED: ${error?.message ?? error}`);
  console.error(error?.stack ?? "(no stack)");
  if (!TOLERANT) process.exit(1);
}
