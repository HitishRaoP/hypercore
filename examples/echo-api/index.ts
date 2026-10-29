/**
 * Echo API — the "hello world" with a real body.
 *
 * URL: https://<api>/w/<worker-name>
 *
 *   GET  /w/echo-api            -> usage JSON (no body needed)
 *   POST /w/echo-api -d "hi"    -> JSON echo + stats about the body
 *   POST /w/echo-api -d '{"a":1}' -> JSON echo preserving the parsed object
 *
 * HyperCore runtime contract (Javy / WASI):
 *   - The HTTP request body arrives on standard input.
 *   - Anything written to standard output becomes the HTTP response body.
 *   - No imports needed: the file is bundled by esbuild, compiled to wasm by
 *     Javy, and executed per request on the node that owns this deployment.
 */

/** Minimal typings for the Javy built-in I/O namespace. */
declare const Javy: {
	IO: {
		readSync(fd: number, buffer: Uint8Array): number;
		writeSync(fd: number, buffer: Uint8Array): number;
	};
};

/** Read every byte currently available on stdin (the request body). */
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

/** Write a string to stdout — it becomes the HTTP response body. */
function reply(text: string): void {
	Javy.IO.writeSync(1, new TextEncoder().encode(text));
}

/** FNV-1a 32-bit hash — deterministic fingerprint for any body. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

const raw = new TextDecoder().decode(readStdin());

// A GET (or any bodyless request) arrives as empty stdin -> send usage help.
if (raw.length === 0) {
	reply(
		JSON.stringify(
			{
				worker: "echo-api",
				usage:
					"POST to this URL with any text or JSON body to get an echo report.",
				example: `curl -X POST -d '{"hello":"hypercore"}' <your-worker-url>`,
			},
			null,
			2,
		),
	);
} else {
	// Preserve JSON bodies as objects; everything else stays text.
	let parsed: unknown;
	let isJson = false;
	try {
		parsed = JSON.parse(raw);
		isJson = true;
	} catch {
		parsed = raw;
	}

	const words = raw.split(/\s+/).filter(Boolean);
	const lines = raw.split(/\r?\n/);

	reply(
		JSON.stringify(
			{
				echo: parsed,
				stats: {
					isJson,
					bytes: new TextEncoder().encode(raw).length,
					chars: raw.length,
					words: words.length,
					lines: lines.length,
					firstWords: words.slice(0, 10),
				},
				transforms: {
					uppercase: raw.toUpperCase(),
					reversed: [...raw].reverse().join(""),
					shaFnv1a: fnv1a(raw),
				},
			},
			null,
			2,
		),
	);
}
