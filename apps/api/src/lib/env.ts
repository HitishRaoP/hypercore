import z from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number<number>(),
  CLOUDFLARE_ACCOUNT_ID: z.string(),
  CLOUDFLARE_ACCESS_KEY_ID: z.string(),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string(),
});

export const env = envSchema.parse(process.env);
