import { z } from "zod";

const envSchema = z.object({
	BETTER_AUTH_URL: z.string(),
	BETTER_AUTH_SECRET: z.string(),
	DASHBOARD_URL: z.url().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
