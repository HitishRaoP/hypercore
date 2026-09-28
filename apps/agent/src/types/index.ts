export interface MachineInfo {
  machineId: string; hostname: string; osName: string; osVersion: string;
  kernelVersion: string; arch: string; cpuLogicalCores: number; cpuPhysicalCores: number;
  cpuBrand: string; totalMemoryMb: number; usedMemoryMb: number; totalDiskMb: number;
  availableDiskMb: number; localIp: string;
}
export interface RegistrationResponse {
  status: string; nodeId: string; sessionToken: string; assignedRegion: string; heartbeatIntervalSecs: number;
}
export interface MetricsTick { cpuPercent: number; usedMemoryMb: number; totalMemoryMb: number; }
export interface ToolchainStatus { esbuild: string | null; javy: string | null; }

export type InvocationStatus = "running" | "done" | "failed" | "timeout";
export type DeploymentStatus =
  | "uploaded" | "routed" | "offline" | "building" | "built" | "failed";

export interface ActivityInvocation {
  invocationId: string; deploymentId: string; workerName: string; machineId: string;
  method: string; path: string; status: InvocationStatus;
  exitCode?: number | null; durationMs?: number | null;
  stdoutPreview?: string | null; error?: string | null;
  startedAt: string; finishedAt?: string | null;
}
export interface ActivityDeployment {
  deploymentId: string; workerName: string; machineId: string;
  entrypoint: string; status: DeploymentStatus; createdAt: string;
  artifactKey?: string | null;
}
export interface ActivityResponse {
  source: "postgres" | "memory"; online: boolean;
  deployments: ActivityDeployment[]; invocations: ActivityInvocation[];
}
