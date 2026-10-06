import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/auth.ts"],
	sourcemap: true,
	clean: true,
	format: "esm",
	dts: true,
	external: ["axios"],
});
