/**
 * Math Engine — real CPU-bound computation running on your own node.
 *
 * URL: https://<api>/w/<worker-name>
 *
 *   GET  /w/math-engine                       -> usage JSON
 *   POST /w/math-engine -d '{"op":"fib","n":90}'      -> fibonacci
 *   POST /w/math-engine -d '{"op":"factorial","n":30}' -> factorial
 *   POST /w/math-engine -d '{"op":"primes","limit":100}' -> sieve of Eratosthenes
 *   POST /w/math-engine -d '{"op":"sort","nums":[5,3,1]}' -> sorted + stats
 *
 * Demonstrates that a HyperCore worker executes genuinely locally on the
 * deployment's node: every request compiles fresh code into wasm and runs it
 * inside the node's own sandbox (fuel budget + wall-clock timeout included).
 */

declare const Javy: {
	IO: {
		readSync(fd: number, buffer: Uint8Array): number;
		writeSync(fd: number, buffer: Uint8Array): number;
	};
};

function readStdin(): Uint8Array {
	const chunkSize = 4096;
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const buffer = new Uint8Array(chunkSize);
		const bytesRead = Javy.IO.readSync(0, buffer);
		if (bytesRead <= 0) break;
		chunks.push(buffer.subarray(0, bytesRead));
		total += bytesRead;
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.length;
	}
	return body;
}

function reply(text: string): void {
	Javy.IO.writeSync(1, new TextEncoder().encode(text));
}

// QuickJS in Javy has its own Date implementation; guard it anyway so the
// worker still answers if timing is unavailable on some runtimes.
function tryNow(): number | null {
	try {
		return Date.now();
	} catch {
		return null;
	}
}

function elapsed(startedAt: number | null): number | null {
	if (startedAt === null) return null;
	return Math.max(0, Date.now() - startedAt);
}

/** Iterative fibonacci with BigInt — exact results past Number.MAX_SAFE. */
function fibonacci(n: bigint): string {
	let a = 0n;
	let b = 1n;
	for (let i = 0n; i < n; i++) {
		[a, b] = [b, a + b];
	}
	return a.toString();
}

function factorial(n: bigint): string {
	let acc = 1n;
	for (let i = 2n; i <= n; i++) {
		acc *= i;
	}
	return acc.toString();
}

/** Sieve of Eratosthenes, capped so the 8s wall-clock limit is never hit. */
function primes(limit: number): { count: number; list: number[]; truncated: boolean } {
	const cap = Math.min(Math.max(Math.floor(limit), 0), 10000);
	const sieve = new Uint8Array(cap + 1).fill(1);
	sieve[0] = 0;
	if (cap > 0) sieve[1] = 0;
	for (let p = 2; p * p <= cap; p++) {
		if (sieve[p]) {
			for (let m = p * p; m <= cap; m += p) sieve[m] = 0;
		}
	}
	const list: number[] = [];
	for (let n = 2; n <= cap; n++) {
		if (sieve[n]) list.push(n);
	}
	return { count: list.length, list, truncated: cap < limit };
}

function usage(): unknown {
	return {
		worker: "math-engine",
		usage: {
			fibonacci: { op: "fib", n: 90 },
			factorial: { op: "factorial", n: 30 },
			primes: { op: "primes", limit: 100 },
			sort: { op: "sort", nums: [5, 3, 9, 1, 4, 1, 5, 9, 2, 6] },
		},
		note: "POST a JSON body with one of the shapes above.",
		limit: "n and sizes are capped so the 8s invocation limit is never hit.",
	};
}

const startedAt = tryNow();
const raw = new TextDecoder().decode(readStdin()).trim();

if (raw.length === 0) {
	reply(JSON.stringify(usage(), null, 2));
} else {
	let body: any;
	try {
		body = JSON.parse(raw);
	} catch {
		reply(
			JSON.stringify(
				{ error: "Body must be valid JSON. Send a GET for usage." },
				null,
				2,
			),
		);
		throw new Error("invalid json body"); // non-zero exit -> 502 with reason
	}

	try {
		let result: Record<string, unknown>;
		switch (body.op) {
			case "fib": {
				const n = BigInt(Math.min(Math.max(Math.floor(Number(body.n ?? 10)), 0), 500));
				result = { op: "fib", n: n.toString(), result: fibonacci(n) };
				break;
			}
			case "factorial": {
				const n = BigInt(Math.min(Math.max(Math.floor(Number(body.n ?? 10)), 0), 200));
				result = { op: "factorial", n: n.toString(), result: factorial(n) };
				break;
			}
			case "primes": {
				const limit = Math.min(Math.max(Math.floor(Number(body.limit ?? 100)), 0), 100000);
				const p = primes(limit);
				result = {
					op: "primes",
					limit,
					count: p.count,
					primes: p.truncated ? p.list.slice(0, 50) : p.list,
					truncated: p.truncated,
				};
				break;
			}
			case "sort": {
				const nums: number[] = Number.isFinite(Number(body.nums?.[0]))
					? (body.nums as number[]).slice(0, 50000)
					: [5, 3, 9, 1, 4, 1, 5, 9, 2, 6];
				const copy = [...nums].sort((a, b) => a - b);
				result = {
					op: "sort",
					count: nums.length,
					result: copy,
					min: copy[0] ?? null,
					max: copy[copy.length - 1] ?? null,
				};
				break;
			}
			default: {
				result = {
					error: `Unknown op '${String(body.op)}'. Send a GET for usage.`,
				};
			}
		}

		const durationMs = elapsed(startedAt);
		if (durationMs !== null) result.durationMs = durationMs;

		reply(JSON.stringify(result, null, 2));
	} catch (error) {
		reply(
			JSON.stringify(
				{ error: `Computation failed: ${(error as Error).message}` },
				null,
				2,
			),
		);
		throw error; // non-zero exit code -> the API returns a structured 502
	}
}
