import type { NewDeploymentRow, NewInvocationRow } from "@hypercore/db";

/**
 * Lazy Postgres access. The db package parses DATABASE_URL at import time,
 * so it is only ever imported when DATABASE_URL is configured — otherwise
 * the API runs on its in-memory state. Every helper is best-effort and
 * never throws into request handling.
 */

type HistoryApi = typeof import("@hypercore/db");

let cached: HistoryApi | null | undefined;

async function historyDb(): Promise<HistoryApi | null> {
  if (!process.env.DATABASE_URL) return null;
  if (cached !== undefined) return cached;
  try {
    cached = await import("@hypercore/db");
    return cached;
  } catch (error) {
    console.warn("[db] postgres unavailable, using memory only:", (error as Error).message);
    cached = null;
    return null;
  }
}

export async function persistDeploymentInsert(row: NewDeploymentRow) {
  try {
    const db = await historyDb();
    if (db) await db.insertDeploymentRow(row);
  } catch (error) {
    console.warn("[db] deployment persist skipped:", (error as Error).message);
  }
}

export async function persistDeploymentUpdate(
  id: string,
  patch: Partial<Pick<NewDeploymentRow, "status" | "artifactKey">>,
) {
  try {
    const db = await historyDb();
    if (db) await db.updateDeploymentRow(id, patch);
  } catch (error) {
    console.warn("[db] deployment update skipped:", (error as Error).message);
  }
}

export async function persistInvocationInsert(row: NewInvocationRow) {
  try {
    const db = await historyDb();
    if (db) await db.insertInvocationRow(row);
  } catch (error) {
    console.warn("[db] invocation persist skipped:", (error as Error).message);
  }
}

export async function persistInvocationFinish(
  id: string,
  patch: Parameters<HistoryApi["finishInvocationRow"]>[1],
) {
  try {
    const db = await historyDb();
    if (db) await db.finishInvocationRow(id, patch);
  } catch (error) {
    console.warn("[db] invocation update skipped:", (error as Error).message);
  }
}

export async function fetchActivity(machineId: string, limit: number) {
  try {
    const db = await historyDb();
    if (!db) return null;
    return await db.getActivity(machineId, limit);
  } catch (error) {
    console.warn("[db] activity read failed, falling back to memory:", (error as Error).message);
    return null;
  }
}
