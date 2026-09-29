import type { DeploymentRow } from "@hypercore/db/schema/deployments";
import type { InvocationRow } from "@hypercore/db/schema/invocations";
import { isAgentOnline } from "../lib/scheduler";
import { listDeploymentsByMachine } from "./deployment.service";
import { listInvocationsByMachine } from "./invocation.service";

/**
 * Node activity feed: deployments + invocation history for one machine,
 * shaped for the agent UI (see apps/agent/src/types).
 */

// ---------------------------------------------------------------------------
// DTOs (mapped 1:1 from DB rows; Dates become ISO strings)
// ---------------------------------------------------------------------------

export interface DeploymentDto {
  deploymentId: string;
  workerName: string;
  machineId: string;
  entrypoint: string;
  files: DeploymentRow["files"];
  status: DeploymentRow["status"];
  artifactKey: string | null;
  createdAt: string;
}

export interface InvocationDto {
  invocationId: string;
  deploymentId: string;
  workerName: string;
  machineId: string;
  method: string;
  path: string;
  status: InvocationRow["status"];
  exitCode: number | null;
  durationMs: number | null;
  stdoutPreview: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ActivityResult {
  source: "postgres";
  online: boolean;
  deployments: DeploymentDto[];
  invocations: InvocationDto[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActivity(machineId: string, limit: number): Promise<ActivityResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const [deploymentRows, invocationRows] = await Promise.all([
    listDeploymentsByMachine(machineId, safeLimit),
    listInvocationsByMachine(machineId, safeLimit),
  ]);
  return {
    source: "postgres",
    online: isAgentOnline(machineId),
    deployments: deploymentRows.map(toDeploymentDto),
    invocations: invocationRows.map(toInvocationDto),
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toDeploymentDto(row: DeploymentRow): DeploymentDto {
  return {
    deploymentId: row.id,
    workerName: row.workerName,
    machineId: row.machineId,
    entrypoint: row.entrypoint,
    files: row.files,
    status: row.status,
    artifactKey: row.artifactKey,
    createdAt: row.createdAt.toISOString(),
  };
}

function toInvocationDto(row: InvocationRow): InvocationDto {
  return {
    invocationId: row.id,
    deploymentId: row.deploymentId,
    workerName: row.workerName,
    machineId: row.machineId,
    method: row.method,
    path: row.path,
    status: row.status,
    exitCode: row.exitCode,
    durationMs: row.durationMs,
    stdoutPreview: row.stdoutPreview,
    error: row.error,
    startedAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
