import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Registered execution nodes. Mirrors the agent's Rust `MachineInfo`
 * (apps/agent/src-tauri/src/machine_info.rs, serde camelCase) with
 * snake_case columns. machine_id is stable per host (machine_uid with a
 * persisted fallback), so registration is an upsert keyed on it.
 */
export const machines = pgTable("machines", {
  machineId: text("machine_id").primaryKey(),
  hostname: text("hostname").notNull(),
  osName: text("os_name").notNull(),
  osVersion: text("os_version").notNull(),
  kernelVersion: text("kernel_version").notNull(),
  arch: text("arch").notNull(),
  cpuLogicalCores: integer("cpu_logical_cores").notNull(),
  cpuPhysicalCores: integer("cpu_physical_cores").notNull(),
  cpuBrand: text("cpu_brand").notNull(),
  totalMemoryMb: integer("total_memory_mb").notNull(),
  usedMemoryMb: integer("used_memory_mb").notNull(),
  totalDiskMb: integer("total_disk_mb").notNull(),
  availableDiskMb: integer("available_disk_mb").notNull(),
  localIp: text("local_ip").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MachineRow = typeof machines.$inferSelect;
export type NewMachineRow = typeof machines.$inferInsert;
