import type { Metadata } from "next";
import { SignedOut } from "@/modules/auth/components/signed-out";
import { ForgotPasswordView } from "@/modules/auth/forgot-password-view";

export const metadata: Metadata = {
	title: "Reset password | HyperCore",
	description: "Request a link to choose a new HyperCore console password.",
};

export default function Page() {
	return (
		<SignedOut>
			<ForgotPasswordView />
		</SignedOut>
	);
}
