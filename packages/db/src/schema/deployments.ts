import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const deployments = pgTable(
	"deployments",
	{
		id: text("id").primaryKey(),
		userId: text("user_id"),
		workerName: text("worker_name").notNull().unique(),
		machineId: text("machine_id").notNull(),
		entrypoint: text("entrypoint").notNull().default("index.ts"),
		files: jsonb("files")
			.$type<
				{
					name: string;
					key: string;
					size: number;
					contentType?: string;
				}[]
			>()
			.notNull(),
		status: text("status").notNull().default("uploaded"),
		artifactKey: text("artifact_key"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("deployments_user_id_idx").on(table.userId)],
);

export type DeploymentRow = typeof deployments.$inferSelect;
export type NewDeploymentRow = typeof deployments.$inferInsert;
