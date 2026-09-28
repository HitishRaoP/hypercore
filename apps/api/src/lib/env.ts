import z from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number<number>().default(8080),
  CLOUDFLARE_ACCOUNT_ID: z.string({error: "CLOUDFLARE_ACCOUNT_ID is required"}),
  CLOUDFLARE_ACCESS_KEY_ID: z.string({error: "CLOUDFLARE_ACCESS_KEY_ID is required"}),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string({error: "CLOUDFLARE_SECRET_ACCESS_KEY is required"}),
  R2_BUCKET: z.string().default("hypercore"),
  DATABASE_URL: z.string().optional(),
  /** Public base URL used to build user-facing invoke URLs. */
  PUBLIC_URL: z.string().optional(),
  /** Wall-clock cap per wasm invocation (worker is terminated past it). */
  INVOKE_TIMEOUT_MS: z.coerce.number<number>().default(10_000),
});

export const env = envSchema.parse(process.env);
