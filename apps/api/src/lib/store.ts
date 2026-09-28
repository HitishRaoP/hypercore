/**
 * In-memory deployment metadata store (Control Plane).
 *
 * Postgres persistence is best-effort (see tryPersist below): the upload
 * flow must keep working locally even when DATABASE_URL is unset, so the
 * scheduler + R2 path never blocks on the DB. When DATABASE_URL is set we
 * attempt a `deployments` insert and log failures instead of 500ing.
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

async function tryPersist(record: DeploymentRecord) {
  if (!process.env.DATABASE_URL) return;
  try {
    // Dynamic, untyped import so @hypercore/db never blocks `tsc` when its
    // dist has not been built yet. Postgres is best-effort metadata only.
    const loader = new Function("return import('@hypercore/db')") as () => Promise<{
      db: { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } };
    }>;
    const schemaLoader = new Function("return import('@hypercore/db/schema/deployments')") as () => Promise<{
      deployments: unknown;
    }>;
    const [{ db }, { deployments: table }] = await Promise.all([loader(), schemaLoader()]);
    await db.insert(table).values({
      id: record.deploymentId,
      workerName: record.workerName,
      machineId: record.machineId,
      entrypoint: record.entrypoint,
      files: record.files,
      status: record.status,
      artifactKey: record.artifactKey ?? null,
    });
  } catch (error) {
    console.warn("[store] postgres persist skipped:", (error as Error).message);
  }
}
