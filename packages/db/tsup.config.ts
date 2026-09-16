import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/schema/*"],
  sourcemap: true,
  clean: true,
  format: "esm",
  dts: true,
});
