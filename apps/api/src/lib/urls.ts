import { env } from "./env";

/** Base URL users hit, e.g. http://localhost:8080 or https://api.hypercore.dev */
export function publicBase() {
	return (env.PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(
		/\/+$/,
		"",
	);
}

/** Immutable per-deployment URL: GET /invoke/:deploymentId */
export const invokeUrlFor = (deploymentId: string) =>
	`${publicBase()}/invoke/${deploymentId}`;

/** Stable worker URL: always serves the latest *built* deployment. */
export const workerUrlFor = (workerName: string) =>
	`${publicBase()}/w/${encodeURIComponent(workerName)}`;
