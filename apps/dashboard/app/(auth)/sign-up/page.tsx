import type { Metadata } from "next";
import { SignedOut } from "@/modules/auth/components/signed-out";
import { SignUpView } from "@/modules/auth/sign-up-view";

export const metadata: Metadata = {
	title: "Sign up | HyperCore",
	description: "Create a HyperCore console account and add a passkey.",
};

export default function Page() {
	return (
		<SignedOut>
			<SignUpView />
		</SignedOut>
	);
}
