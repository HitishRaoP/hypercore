#!/usr/bin/env node
/**
 * sync-agent-version.mjs — single source of truth for the agent version.
 *
 * Usage:
 *   bun ./scripts/sync-agent-version.mjs 0.2.0
 *   bun ./scripts/sync-agent-version.mjs v0.2.0
 *
 * Normalises the input (strips a leading `v`) and writes the same version
 * into all three places Tauri requires to agree:
 *   - package.json          (frontend)
 *   - src-tauri/tauri.conf.json (bundle metadata)
 *   - src-tauri/Cargo.toml  ([package] version)
 *
 * The release workflow (`.github/workflows/release.yml`) calls this with the
 * tag name so `git tag v0.2.0 && git push origin v0.2.0` is all it takes to
 * cut a versioned release. Run it locally before tagging to keep the repo
 * files in sync with the tag you are about to create.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agentDir = join(here, "..");

const raw = process.argv[2];
if (!raw) {
  console.error("usage: sync-agent-version.mjs <version> (e.g. 0.2.0 or v0.2.0)");
  process.exit(1);
}

const version = raw.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`invalid semver version: ${raw}`);
  process.exit(1);
}

function updateJsonVersion(path, version) {
  // Surgical replacement of the top-level "version" line only, so the rest
  // of the file (indentation, line endings, trailing whitespace) is
  // preserved byte-for-byte.
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const idx = lines.findIndex((line) =>
    /^\s*"version"\s*:\s*"[^"]*"\s*,?\s*$/.test(line),
  );
  if (idx === -1) {
    throw new Error(`no top-level "version" field found in ${path}`);
  }
  const trailingComma = lines[idx].trimEnd().endsWith(",") ? "," : "";
  const indent = lines[idx].slice(0, lines[idx].indexOf('"'));
  lines[idx] = `${indent}"version": "${version}"${trailingComma}`;
  writeFileSync(path, lines.join(eol));
}

// 1. package.json
updateJsonVersion(join(agentDir, "package.json"), version);

// 2. tauri.conf.json
updateJsonVersion(join(agentDir, "src-tauri", "tauri.conf.json"), version);

// 3. Cargo.toml — replace only the [package] version, leave dependency versions alone.
const cargoPath = join(agentDir, "src-tauri", "Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const replaced = cargo.replace(
  /(\[package\][^\[]*?\nversion\s*=\s*")[^"]+(")/,
  `$1${version}$2`,
);
if (replaced === cargo) {
  console.error("failed to find [package] version in src-tauri/Cargo.toml");
  process.exit(1);
}
writeFileSync(cargoPath, replaced);

console.log(`[sync-agent-version] agent version set to ${version}`);
