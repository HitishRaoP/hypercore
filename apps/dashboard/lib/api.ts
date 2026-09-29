import { env } from "@/lib/env";

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

export interface Deployment {
  deploymentId: string;
  workerName: string;
  machineId: string;
  entrypoint: string;
  status: string;
  createdAt: string;
}

export interface Invocation {
  invocationId: string;
  deploymentId: string;
  workerName: string;
  machineId: string;
  method: string;
  path: string;
  status: string;
  exitCode: number | null;
  durationMs: number | null;
  stdoutPreview: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** All registered execution nodes (network-wide, not user-scoped). */
export async function fetchNodes(): Promise<MachineNode[]> {
  const data = await getJson<{ nodes: MachineNode[] }>(
    `${env.API_URL}/api/v1/nodes`,
  );
  return data?.nodes ?? [];
}

/** Deployments owned by the signed-in user. */
export async function fetchMyDeployments(): Promise<Deployment[]> {
  const data = await getJson<{ deployments: Deployment[] }>(
    `${env.API_URL}/deployment`,
  );
  return data?.deployments ?? [];
}

/** Invocations of the signed-in user's deployments. */
export async function fetchMyInvocations(): Promise<Invocation[]> {
  const data = await getJson<{ invocations: Invocation[] }>(
    `${env.API_URL}/invocations`,
  );
  return data?.invocations ?? [];
}
