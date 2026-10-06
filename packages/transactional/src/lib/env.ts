// No `import 'dotenv/config'` here: this package is bundled to ESM for Node
// consumers, and dotenv's CJS `require('fs')` cannot survive that transform.
// Loading .env is the application's job (apps/api/src/app.ts does it).
import z from "zod";

const envSchema = z.object({
	RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
	FROM_EMAIL: z.email("FROM_EMAIL must be a valid email"),
	DASHBOARD_URL: z.url(),
});

export const env = envSchema.parse(process.env);
