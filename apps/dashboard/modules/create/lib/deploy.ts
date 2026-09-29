"use client";

import {
  adjectives,
  animals,
  NumberDictionary,
  uniqueNamesGenerator,
} from "unique-names-generator";
import { env } from "@/lib/env";

export const HELLO_WORLD_ENTRYPOINT = "index.ts";

export const HELLO_WORLD_INDEX_TS = `export function handler(): string {
  return "Hello, World!";
}

console.log(handler());
`;

export const HELLO_WORLD_PACKAGE_JSON = `{
  "name": "hypercore-hello-world",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "esbuild index.ts --bundle --format=esm --platform=neutral --outfile=bundle.js"
  },
  "devDependencies": {
    "esbuild": "^0.21.0"
  }
}
`;

export const HELLO_WORLD_BUN_LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "hypercore-hello-world",
      "dependencies": {}
    }
  },
  "packages": {}
}
`;

export function helloWorldFiles(): File[] {
  return [
    new File([HELLO_WORLD_INDEX_TS], "index.ts", { type: "text/typescript" }),
    new File([HELLO_WORLD_PACKAGE_JSON], "package.json", {
      type: "application/json",
    }),
    new File([HELLO_WORLD_BUN_LOCK], "bun.lock", {
      type: "application/json",
    }),
  ];
}

export async function fetchOnlineAgents(): Promise<string[]> {
  const res = await fetch(`${env.API_URL}/agents/online`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.online) ? data.online : [];
}

/** One registered execution node (GET /api/v1/nodes). */
export interface MachineNode {
  machineId: string;
  hostname: string;
  osName: string;
  osVersion: string;
  kernelVersion: string;
  arch: string;
  cpuLogicalCores: number;
  cpuPhysicalCores: number;
  cpuBrand: string;
  totalMemoryMb: number;
  usedMemoryMb: number;
  totalDiskMb: number;
  availableDiskMb: number;
  localIp: string;
  firstSeenAt: string;
  lastSeenAt: string;
  online: boolean;
}

export async function fetchNodes(): Promise<MachineNode[]> {
  const res = await fetch(`${env.API_URL}/api/v1/nodes`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.nodes) ? (data.nodes as MachineNode[]) : [];
}

/** Random worker slug in the style of "brave-fox-3588". */
export function generateWorkerSlug(): string {
  return uniqueNamesGenerator({
    dictionaries: [
      adjectives,
      animals,
      NumberDictionary.generate({ min: 1000, max: 9999 }),
    ],
    separator: "-",
    length: 3,
    style: "lowerCase",
  });
}

/**
 * True when the name is already taken, false when free, null when the
 * API couldn't be reached (deploy will still validate server-side).
 */
export async function checkWorkerNameTaken(name: string): Promise<boolean | null> {
  const workerName = name.trim();
  if (!workerName) return null;
  try {
    const res = await fetch(
      `${env.API_URL}/code-upload/check-name?workerName=${encodeURIComponent(workerName)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return typeof data?.taken === "boolean" ? data.taken : null;
  } catch {
    return null;
  }
}

/** Shared deploy-response shape rendered by the success card. */
export interface DeployResultData {
  status: string;
  deploymentId: string;
  workerName: string;
  machineId: string;
  entrypoint: string;
  files: { name: string; key: string }[];
  invokeUrl: string;
  workerUrl: string;
}
