import type { ReactNode } from "react";
import { ProtectedShell } from "@/components/protected-shell";
import { SignedIn } from "@/modules/auth/components/signed-in";

export default function ProtectedLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<SignedIn>
			<ProtectedShell>{children}</ProtectedShell>
		</SignedIn>
	);
}
