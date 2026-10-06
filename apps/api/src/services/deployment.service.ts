import { desc, eq } from "drizzle-orm";
import { db } from "@hypercore/db";
import {
  deployments,
  type DeploymentRow,
  type NewDeploymentRow,
} from "@hypercore/db/schema/deployments";
import { WorkerNameTakenError } from "../lib/errors";

/**
 * Deployment persistence (Postgres is the source of truth).
 * worker_name is globally unique: the pre-check below rejects the common
 * case early, and the unique constraint guards the race (mapped to 409).
 */

export type DeploymentStatus = DeploymentRow["status"];

export interface CreateDeploymentInput {
  deploymentId: string;
  userId: string;
  workerName: string;
  machineId: string;
  entrypoint: string;
  files: NewDeploymentRow["files"];
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps driver failures in DrizzleQueryError with the Postgres
  // error on `.cause`, so unwrap a few levels before giving up.
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current != null; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    const message = current instanceof Error ? current.message : String(current);
    if (message.includes("duplicate key") || message.includes("unique constraint")) return true;
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : null;
  }
  return false;
}

export async function createDeployment(input: CreateDeploymentInput): Promise<DeploymentRow> {
  try {
    const [row] = await db
      .insert(deployments)
      .values({
        id: input.deploymentId,
        userId: input.userId,
        workerName: input.workerName,
        machineId: input.machineId,
        entrypoint: input.entrypoint,
        files: input.files,
        status: "uploaded",
      })
      .returning();
    if (!row) throw new Error("Deployment insert returned no row");
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new WorkerNameTakenError(input.workerName);
    throw error;
  }
}

export async function getDeploymentById(deploymentId: string): Promise<DeploymentRow | undefined> {
  const [row] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  return row;
}

/** The single deployment behind a worker URL — only once its wasm artifact exists. */
export async function getLatestBuiltDeployment(
  workerName: string,
): Promise<DeploymentRow | undefined> {
  const [row] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.workerName, workerName))
    .limit(1);
  if (!row || !row.artifactKey) return undefined;
  return row;
}

export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
): Promise<void> {
  await db.update(deployments).set({ status }).where(eq(deployments.id, deploymentId));
}

export async function markDeploymentBuilt(deploymentId: string, artifactKey: string): Promise<void> {
  await db
    .update(deployments)
    .set({ status: "built", artifactKey })
    .where(eq(deployments.id, deploymentId));
}

export async function isWorkerNameTaken(workerName: string): Promise<boolean> {
  const [row] = await db
    .select({ id: deployments.id })
    .from(deployments)
    .where(eq(deployments.workerName, workerName))
    .limit(1);
  return row !== undefined;
}

export async function listDeploymentsByMachine(
  machineId: string,
  limit: number,
): Promise<DeploymentRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return db
    .select()
    .from(deployments)
    .where(eq(deployments.machineId, machineId))
    .orderBy(desc(deployments.createdAt))
    .limit(safeLimit);
}

export async function listDeploymentsByUser(
  userId: string,
  limit: number,
): Promise<DeploymentRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return db
    .select()
    .from(deployments)
    .where(eq(deployments.userId, userId))
    .orderBy(desc(deployments.createdAt))
    .limit(safeLimit);
}
