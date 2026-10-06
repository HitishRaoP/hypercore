import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { env } from "@/lib/env";

export const authClient = createAuthClient({
	baseURL: env.API_URL,
	plugins: [passkeyClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
