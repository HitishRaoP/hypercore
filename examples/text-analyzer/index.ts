/**
 * Text Analyzer — turns a pasted body into a formatted text report.
 *
 * URL: https://<api>/w/<worker-name>
 *
 *   GET  /w/text-analyzer      -> usage help
 *   POST /w/text-analyzer -d "The quick brown fox jumps over the lazy dog"
 *
 * All input comes from standard input (the request body) and the report is
 * written to standard output, which the platform returns as the HTTP
 * response. Great live demo: paste any paragraph text and get instant
 * statistics back from the node.
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

const WORD_RE = /[a-zA-Z0-9']+/g;

/** Tiny stop-word set — deliberately small and readable, not academic. */
const STOP_WORDS = new Set([
	"the", "and", "a", "an", "of", "to", "in", "is", "it", "that", "for", "on",
	"with", "as", "was", "at", "be", "this", "or", "are", "were", "by", "we",
	"you", "your", "not", "i", "he", "she", "they", "them", "his", "her",
	"their", "our", "us", "my", "me", "so", "if", "than", "then", "there",
	"here", "do", "does", "did", "have", "has", "had", "will", "would", "can",
	"could",
]);

function tokenize(input: string): string[] {
	return input.match(WORD_RE) ?? [];
}

interface Suggestion {
	word: string;
	count: number;
}

/** Top-N most frequent words, longest word wins on ties for readability. */
function topWords(counts: Map<string, number>, limit: number): Suggestion[] {
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
		.slice(0, limit)
		.map(([word, count]) => ({ word, count }));
}

function histogram(counts: Map<string, number>, rows: number): string[] {
	const top = topWords(counts, rows);
	if (top.length === 0) return [];
	const maxCount = top[0].count;
	const barWidth = 30;
	return top.map(({ word, count }) => {
		const width = Math.max(1, Math.round((count / maxCount) * barWidth));
		return `${word.padEnd(15)} | ${"#".repeat(width)} ${count}`;
	});
}

const raw = new TextDecoder().decode(readStdin());

if (raw.trim().length === 0) {
	reply(
		[
			"text-analyzer — paste analysis service for HyperCore",
			"",
			"usage:",
			"  POST to this URL with any plain-text body:",
			'  curl -X POST -d "Your paragraph here" https://<your-worker-url>/',
			"",
			"returns a formatted report with counts, reading time,",
			"top keywords and an ASCII frequency histogram.",
		].join("\n"),
	);
} else {
	const words = tokenize(raw.toLowerCase()).filter(
		(w) => w.length > 1 && !STOP_WORDS.has(w),
	);
	const allWords = tokenize(raw);
	const counts = new Map<string, number>();
	for (const word of words) {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}

	const mentionsHypercore = raw.toLowerCase().includes("hypercore");

	const uniqueWords = new Set(allWords.map((w) => w.toLowerCase()));
	const longest = allWords.reduce(
		(best, w) => (w.length > best.length ? w : best),
		"",
	);
	const avgWordLength = allWords.length
		? allWords.reduce((sum, w) => sum + w.length, 0) / allWords.length
		: 0;
	const sentenceCount = raw.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
	const avgSentenceLength = sentenceCount
		? allWords.length / sentenceCount
		: 0;
	// Reading time at ~200 wpm, ceiling of 1 minute.
	const readingMinutes = Math.max(1, Math.round(allWords.length / 200));

	// Lexical richness: unique words / total words, 0..1000 per mille.
	const richness = allWords.length
		? Math.round((uniqueWords.size / allWords.length) * 1000) / 10
		: 0;

	reply(
		[
			"=== text-analyzer report ===",
			"",
			`characters        ${raw.length}`,
			`words             ${allWords.length}`,
			`unique words      ${uniqueWords.size}`,
			`lexical richness  ${richness}%`,
			`sentences         ${sentenceCount}`,
			`avg words/sentence ${avgSentenceLength.toFixed(1)}`,
			`avg word length   ${avgWordLength.toFixed(1)}`,
			`longest word      ${longest || "-"}`,
			`reading time      ~${readingMinutes} min`,
			`mentions          ${mentionsHypercore ? "hypercore ✓" : "-"}`,
			"",
			"--- top keywords ---",
			...(histogram(counts, 8).length ? histogram(counts, 8) : ["(no keywords)"]),
		].join("\n"),
	);
}
