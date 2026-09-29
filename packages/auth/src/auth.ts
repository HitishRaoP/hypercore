import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@hypercore/db";
import * as schema from "@hypercore/db/schema/auth";
import { passkey } from "@better-auth/passkey"

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    trustedOrigins: [
        process.env.DASHBOARD_URL ?? "http://localhost:3000",
    ],
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
    },
    plugins: [
        passkey(),
    ],
});
