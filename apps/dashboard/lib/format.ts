export function timeAgo(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - d.getTime()) / 1000),
	);
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

export function formatDuration(ms?: number | null): string {
	if (ms === undefined || ms === null) return "—";
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
	const m = Math.floor(s / 60);
	const rest = Math.round(s % 60);
	return `${m}m ${rest}s`;
}

export function shortId(id: string): string {
	if (!id) return "—";
	return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function formatDateTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatLogTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const MONTHS = [
		"JAN",
		"FEB",
		"MAR",
		"APR",
		"MAY",
		"JUN",
		"JUL",
		"AUG",
		"SEP",
		"OCT",
		"NOV",
		"DEC",
	];
	const pad = (n: number, l = 2) => String(n).padStart(l, "0");
	return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`;
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(2)} MB`;
}

type StatusTone = "success" | "info" | "warning" | "danger" | "secondary";

export function invocationTone(status: string): StatusTone {
	switch (status?.toLowerCase()) {
		case "done":
			return "success";
		case "running":
			return "info";
		case "failed":
		case "timeout":
		case "error":
			return "danger";
		default:
			return "secondary";
	}
}

export function deploymentTone(status: string): StatusTone {
	switch (status?.toLowerCase()) {
		case "routed":
		case "built":
		case "ready":
		case "active":
			return "success";
		case "building":
		case "deploying":
			return "info";
		case "failed":
		case "error":
			return "danger";
		case "uploaded":
		case "offline":
		case "queued":
		default:
			return "warning";
	}
}

export function deploymentLabel(status: string): string {
	switch (status?.toLowerCase()) {
		case "routed":
		case "built":
			return "Ready";
		case "building":
			return "Building";
		case "failed":
			return "Error";
		case "uploaded":
			return "Uploaded";
		case "offline":
			return "Offline";
		default:
			return status || "Unknown";
	}
}
