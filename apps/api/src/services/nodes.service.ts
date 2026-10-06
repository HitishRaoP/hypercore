import { db } from "@hypercore/db";
import {
	type MachineRow,
	machines,
	type NewMachineRow,
} from "@hypercore/db/schema/machines";
import { desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { HttpError } from "../lib/errors";
import { isAgentOnline } from "../lib/scheduler";

/**
 * Execution-node registry. The agent POSTs its Rust `MachineInfo`
 * (camelCase JSON) to /api/v1/nodes/register; machine_id is stable per
 * host, so registration is an upsert that refreshes specs + lastSeenAt.
 * All row types are inferred from the table — nothing is mirrored by hand.
 */

const machinePayloadSchema = z.object({
	machineId: z.string().min(1),
	hostname: z.string(),
	osName: z.string(),
	osVersion: z.string(),
	kernelVersion: z.string(),
	arch: z.string(),
	cpuLogicalCores: z.number().int().nonnegative(),
	cpuPhysicalCores: z.number().int().nonnegative(),
	cpuBrand: z.string(),
	totalMemoryMb: z.number().int().nonnegative(),
	usedMemoryMb: z.number().int().nonnegative(),
	totalDiskMb: z.number().int().nonnegative(),
	availableDiskMb: z.number().int().nonnegative(),
	localIp: z.string(),
});

export interface MachineDto {
	machineId: MachineRow["machineId"];
	hostname: MachineRow["hostname"];
	osName: MachineRow["osName"];
	osVersion: MachineRow["osVersion"];
	kernelVersion: MachineRow["kernelVersion"];
	arch: MachineRow["arch"];
	cpuLogicalCores: MachineRow["cpuLogicalCores"];
	cpuPhysicalCores: MachineRow["cpuPhysicalCores"];
	cpuBrand: MachineRow["cpuBrand"];
	totalMemoryMb: MachineRow["totalMemoryMb"];
	usedMemoryMb: MachineRow["usedMemoryMb"];
	totalDiskMb: MachineRow["totalDiskMb"];
	availableDiskMb: MachineRow["availableDiskMb"];
	localIp: MachineRow["localIp"];
	firstSeenAt: string;
	lastSeenAt: string;
	online: boolean;
}

export interface RegistrationResult {
	status: "success";
	nodeId: string;
	sessionToken: string;
	assignedRegion: string;
	heartbeatIntervalSecs: number;
}

export async function registerMachine(
	payload: unknown,
): Promise<RegistrationResult> {
	const parsed = machinePayloadSchema.safeParse(payload);
	if (!parsed.success) {
		const fields = parsed.error.issues
			.map((issue) => issue.path.join("."))
			.join(", ");
		throw new HttpError(400, `Invalid machine payload: ${fields}`);
	}
	const specs: Omit<
		NewMachineRow,
		"machineId" | "firstSeenAt" | "lastSeenAt"
	> = {
		hostname: parsed.data.hostname,
		osName: parsed.data.osName,
		osVersion: parsed.data.osVersion,
		kernelVersion: parsed.data.kernelVersion,
		arch: parsed.data.arch,
		cpuLogicalCores: parsed.data.cpuLogicalCores,
		cpuPhysicalCores: parsed.data.cpuPhysicalCores,
		cpuBrand: parsed.data.cpuBrand,
		totalMemoryMb: parsed.data.totalMemoryMb,
		usedMemoryMb: parsed.data.usedMemoryMb,
		totalDiskMb: parsed.data.totalDiskMb,
		availableDiskMb: parsed.data.availableDiskMb,
		localIp: parsed.data.localIp,
	};

	await db
		.insert(machines)
		.values({ machineId: parsed.data.machineId, ...specs })
		.onConflictDoUpdate({
			target: machines.machineId,
			set: { ...specs, lastSeenAt: new Date() },
		});

	return {
		status: "success",
		nodeId: parsed.data.machineId,
		sessionToken: uuidv4(),
		assignedRegion: "local",
		heartbeatIntervalSecs: 5,
	};
}

export async function getMachineById(
	machineId: string,
): Promise<MachineRow | undefined> {
	const [row] = await db
		.select()
		.from(machines)
		.where(eq(machines.machineId, machineId))
		.limit(1);
	return row;
}

export async function listMachines(): Promise<MachineRow[]> {
	return db.select().from(machines).orderBy(desc(machines.lastSeenAt));
}

export function toMachineDto(row: MachineRow): MachineDto {
	return {
		machineId: row.machineId,
		hostname: row.hostname,
		osName: row.osName,
		osVersion: row.osVersion,
		kernelVersion: row.kernelVersion,
		arch: row.arch,
		cpuLogicalCores: row.cpuLogicalCores,
		cpuPhysicalCores: row.cpuPhysicalCores,
		cpuBrand: row.cpuBrand,
		totalMemoryMb: row.totalMemoryMb,
		usedMemoryMb: row.usedMemoryMb,
		totalDiskMb: row.totalDiskMb,
		availableDiskMb: row.availableDiskMb,
		localIp: row.localIp,
		firstSeenAt: row.firstSeenAt.toISOString(),
		lastSeenAt: row.lastSeenAt.toISOString(),
		online: isAgentOnline(row.machineId),
	};
}
