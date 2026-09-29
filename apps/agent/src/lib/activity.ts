import type { DeploymentStatus, InvocationStatus } from "../types";

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`;
}

export function invocationVariant(status: InvocationStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case "running":
      return "default";
    case "failed":
    case "timeout":
      return "destructive";
    case "done":
    default:
      return "secondary";
  }
}

export function deploymentVariant(
  status: DeploymentStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "building":
    case "routed":
      return "default";
    case "failed":
      return "destructive";
    case "uploaded":
    case "offline":
      return "outline";
    case "built":
    default:
      return "secondary";
  }
}
