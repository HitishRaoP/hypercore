import { defineConfig } from "tsup";

export default defineConfig({
	// No barrel file: consumers import the client (".") and table
	// definitions ("./schema/*") through the package.json subpath exports.
	entry: ["src/db.ts", "src/schema/*"],
	sourcemap: true,
	clean: true,
	format: "esm",
	dts: true,
	// Keep a single copy of the query builder at runtime: API services import
	// drizzle-orm operators directly, so the bundled client must not inline
	// its own copy (cross-copy SQL objects break the query builder).
	external: ["drizzle-orm", "drizzle-orm/*", "postgres"],
});
