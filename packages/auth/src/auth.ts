import { passkey } from "@better-auth/passkey";
import { db } from "@hypercore/db";
import * as schema from "@hypercore/db/schema/auth";
import ForgotPasswordEmail from "@hypercore/transactional/emails/forgot-password";
import ResetPasswordEmail from "@hypercore/transactional/emails/reset-password";
import { sendMail } from "@hypercore/transactional/send-mail";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "./lib/env";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	trustedOrigins: [env.DASHBOARD_URL],
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
		sendResetPassword: async ({ user, url, token }) => {
			const resetUrl = new URL(
				`${env.DASHBOARD_URL}/reset-password?token=${token}`,
			);
			void sendMail(
				user.email,
				"Cursent - Reset your password",
				ForgotPasswordEmail({ url: resetUrl.toString() }),
			);
		},
		onPasswordReset: async ({ user }) => {
			void sendMail(
				user.email,
				"Cursent - Password reset successful",
				ResetPasswordEmail({}),
			);
		},
	},
	plugins: [passkey()],
});
