import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { deployments, type NewDeploymentRow } from "./schema/deployments";
import { invocations, type NewInvocationRow } from "./schema/invocations";

/**
 * Durable activity log (Postgres mirror of the API's in-memory state).
 * All writes are idempotent / best-effort — callers must never fail a
 * request because persistence failed.
 */

export async function insertDeploymentRow(row: NewDeploymentRow) {
  await db.insert(deployments).values(row).onConflictDoNothing();
}

export async function updateDeploymentRow(
  id: string,
  patch: Partial<Pick<NewDeploymentRow, "status" | "artifactKey">>,
) {
  await db.update(deployments).set(patch).where(eq(deployments.id, id));
}

export async function insertInvocationRow(row: NewInvocationRow) {
  await db.insert(invocations).values(row).onConflictDoNothing();
}

export async function finishInvocationRow(
  id: string,
  patch: Pick<NewInvocationRow, "status"> &
    Partial<Pick<NewInvocationRow, "exitCode" | "durationMs" | "stdoutPreview" | "error" | "finishedAt">>,
) {
  await db
    .update(invocations)
    .set({ ...patch, finishedAt: patch.finishedAt ?? new Date() })
    .where(eq(invocations.id, id));
}

export async function getActivity(machineId: string, limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const [deploymentRows, invocationRows] = await Promise.all([
    db
      .select()
      .from(deployments)
      .where(eq(deployments.machineId, machineId))
      .orderBy(desc(deployments.createdAt))
      .limit(safeLimit),
    db
      .select()
      .from(invocations)
      .where(eq(invocations.machineId, machineId))
      .orderBy(desc(invocations.createdAt))
      .limit(safeLimit),
  ]);
  return { deployments: deploymentRows, invocations: invocationRows };
}
