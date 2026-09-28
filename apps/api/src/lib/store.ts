import { persistDeploymentInsert, persistDeploymentUpdate } from "./db";

/**
 * In-memory deployment metadata store (Control Plane).
 *
 * Postgres persistence is best-effort (see tryPersist below): the upload
 * flow must keep working locally even when DATABASE_URL is unset, so the
 * scheduler + R2 path never blocks on the DB. When DATABASE_URL is set we
 * mirror inserts/updates into the `deployments` table and log failures
 * instead of 500ing.
 */

export interface DeploymentFile {
  name: string;
  key: string;
  size: number;
  contentType?: string;
}

export type DeploymentStatus =
  | "uploaded"
  | "routed"
  | "offline"
  | "building"
  | "built"
  | "failed";

export interface DeploymentRecord {
  deploymentId: string;
  workerName: string;
  machineId: string;
  entrypoint: string;
  files: DeploymentFile[];
  status: DeploymentStatus;
  artifactKey?: string;
  createdAt: string;
}

const deployments = new Map<string, DeploymentRecord>();

export function saveDeployment(record: DeploymentRecord) {
  deployments.set(record.deploymentId, record);
  void tryPersist(record);
}

export function getDeployment(deploymentId: string) {
  return deployments.get(deploymentId);
}

export function updateDeployment(
  deploymentId: string,
  patch: Partial<Pick<DeploymentRecord, "status" | "artifactKey">>,
) {
  const existing = deployments.get(deploymentId);
  if (!existing) return undefined;
  const next = { ...existing, ...patch };
  deployments.set(deploymentId, next);
  void persistDeploymentUpdate(deploymentId, patch);
  return next;
}

/** Latest deployment for a worker that already has a wasm artifact in R2. */
export function getLatestByWorkerName(workerName: string) {
  let best: DeploymentRecord | undefined;
  for (const record of deployments.values()) {
    if (record.workerName !== workerName || !record.artifactKey) continue;
    if (!best || record.createdAt > best.createdAt) best = record;
  }
  return best;
}

export function listDeployments(machineId: string, limit: number) {
  return [...deployments.values()]
    .filter((record) => record.machineId === machineId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(limit, 1));
}

async function tryPersist(record: DeploymentRecord) {
  await persistDeploymentInsert({
    id: record.deploymentId,
    workerName: record.workerName,
    machineId: record.machineId,
    entrypoint: record.entrypoint,
    files: record.files,
    status: record.status,
    artifactKey: record.artifactKey ?? null,
  });
}
