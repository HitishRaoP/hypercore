import type { Metadata } from "next";
import { SignedOut } from "@/modules/auth/components/signed-out";
import { SignInView } from "@/modules/auth/sign-in-view";

export const metadata: Metadata = {
	title: "Sign in | HyperCore",
	description: "Sign in to the HyperCore console with your passkey.",
};

export default function Page() {
	return (
		<SignedOut>
			<SignInView />
		</SignedOut>
	);
}
