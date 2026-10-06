"use client";

import { Spinner } from "@hypercore/ui/components/spinner";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/** Client-side guard for auth pages: bounces signed-in users to console. */
export function SignedOut({ children }: { children: ReactNode }) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	useEffect(() => {
		if (!isPending && session) router.replace("/deployments");
	}, [isPending, session, router]);

	if (isPending || session) {
		return (
			<div className="flex h-screen items-center justify-center">
				<Spinner />
			</div>
		);
	}
	return <>{children}</>;
}
