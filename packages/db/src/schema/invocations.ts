import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { deployments } from "./deployments";

export const invocations = pgTable(
	"invocations",
	{
		id: text("id").primaryKey(),
		userId: text("user_id"),
		deploymentId: text("deployment_id")
			.notNull()
			.references(() => deployments.id),
		workerName: text("worker_name").notNull(),
		machineId: text("machine_id").notNull(),
		method: text("method").notNull(),
		path: text("path").notNull(),
		status: text("status").notNull().default("running"),
		exitCode: integer("exit_code"),
		durationMs: integer("duration_ms"),
		stdoutPreview: text("stdout_preview"),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(table) => [
		index("invocations_machine_id_created_idx").on(
			table.machineId,
			table.createdAt,
		),
		index("invocations_user_id_created_idx").on(
			table.userId,
			table.createdAt,
		),
	],
);

export type InvocationRow = typeof invocations.$inferSelect;
export type NewInvocationRow = typeof invocations.$inferInsert;
