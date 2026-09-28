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
  // preserved byte-for-byte. A no-op when already in sync.
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
  const next = `${indent}"version": "${version}"${trailingComma}`;
  if (lines[idx] !== next) {
    lines[idx] = next;
    writeFileSync(path, lines.join(eol));
    console.log(`[sync-agent-version] ${path} version set to ${version}`);
  } else {
    console.log(`[sync-agent-version] ${path} already at ${version}`);
  }
}

// 1. package.json
updateJsonVersion(join(agentDir, "package.json"), version);

// 2. tauri.conf.json
updateJsonVersion(join(agentDir, "src-tauri", "tauri.conf.json"), version);

// 3. Cargo.toml — replace the version value under [package] only, leaving
// dependency versions and formatting untouched. Line-based so it is immune
// to line-ending or layout differences, and a no-op (not a failure) when
// the file already carries the target version.
const cargoPath = join(agentDir, "src-tauri", "Cargo.toml");
const cargoText = readFileSync(cargoPath, "utf8");
const cargoEol = cargoText.includes("\r\n") ? "\r\n" : "\n";
const cargoLines = cargoText.split(/\r?\n/);
let inPackage = false;
let cargoFound = false;
let cargoChanged = false;
for (let i = 0; i < cargoLines.length; i++) {
  const trimmed = cargoLines[i].trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    inPackage = trimmed === "[package]";
    continue;
  }
  if (!inPackage) continue;
  const m = /^(\s*version\s*=\s*")([^"]*)(".*)$/.exec(cargoLines[i]);
  if (m) {
    cargoFound = true;
    if (m[2] !== version) {
      cargoLines[i] = `${m[1]}${version}${m[3]}`;
      cargoChanged = true;
    }
    break;
  }
}
if (!cargoFound) {
  console.error(
    `[sync-agent-version] failed to find version under [package] in ${cargoPath}`,
  );
  console.error("[sync-agent-version] first lines of the file:");
  console.error(
    cargoLines
      .slice(0, 12)
      .map((line) => JSON.stringify(line))
      .join("\n"),
  );
  process.exit(1);
}
if (cargoChanged) {
  writeFileSync(cargoPath, cargoLines.join(cargoEol));
  console.log(`[sync-agent-version] ${cargoPath} version set to ${version}`);
} else {
  console.log(`[sync-agent-version] ${cargoPath} already at ${version}`);
}

console.log(`[sync-agent-version] done — agent version is ${version}`);
