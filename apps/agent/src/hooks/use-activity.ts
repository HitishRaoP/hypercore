import { useCallback, useEffect, useState } from "react";
import type { ActivityResponse } from "../types";

export function useActivity(
	coordinatorUrl: string,
	machineId: string,
	opts?: { intervalMs?: number; enabled?: boolean },
) {
	const intervalMs = opts?.intervalMs ?? 3000;
	const enabled = opts?.enabled ?? true;
	const [data, setData] = useState<ActivityResponse | null>(null);
	const [updatedAt, setUpdatedAt] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [refreshing, setRefreshing] = useState(false);

	const load = useCallback(async () => {
		if (!coordinatorUrl || !machineId) return;
		try {
			const res = await fetch(
				`${coordinatorUrl.replace(/\/+$/, "")}/activity?machineId=${encodeURIComponent(machineId)}&limit=50`,
			);
			if (!res.ok)
				throw new Error(`Coordinator responded ${res.status}`);
			setData(await res.json());
			setUpdatedAt(Date.now());
			setError("");
		} catch (reason) {
			const detail =
				reason instanceof Error
					? reason.message
					: "Could not reach coordinator.";
			setError(`${detail} — ${coordinatorUrl.replace(/\/+$/, "")}`);
		}
	}, [coordinatorUrl, machineId]);

	useEffect(() => {
		if (!enabled) return;
		void load();
		const timer = setInterval(() => void load(), intervalMs);
		return () => clearInterval(timer);
	}, [load, enabled, intervalMs]);

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await load();
		} finally {
			setRefreshing(false);
		}
	}, [load]);

	return { data, updatedAt, error, refreshing, refresh };
}
