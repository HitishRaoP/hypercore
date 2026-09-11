import z from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number<number>(),
  CLOUDFLARE_ACCOUNT_ID: z.string({error: "CLOUDFLARE_ACCOUNT_ID is required"}),
  CLOUDFLARE_ACCESS_KEY_ID: z.string({error: "CLOUDFLARE_ACCESS_KEY_ID is required"}),
  CLOUDFLARE_SECRET_ACCESS_KEY: z.string({error: "CLOUDFLARE_SECRET_ACCESS_KEY is required"}),
  CLOUDAMQP_URL: z.url(),
  RABBITMQ_EXCHANGE: z.string({error: "CLOUDFLARE_ACCESS_KEY_ID is required"})
});

export const env = envSchema.parse(process.env);
