import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/send-mail.ts", "emails/*.tsx"],
	sourcemap: true,
	clean: true,
	format: "esm",
	dts: true,
});
