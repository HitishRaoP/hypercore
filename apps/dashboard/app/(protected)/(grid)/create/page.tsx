import type { Metadata } from "next";
import { SignedIn } from "@/modules/auth/components/signed-in";
import { CreateView } from "@/modules/create/create-view";
import { PasskeyGate } from "@/modules/create/passkey-gate";

export const metadata: Metadata = {
	title: "Create deployment | HyperCore",
	description: "Deploy a TypeScript function to the HyperCore network.",
};

export default function Page() {
	return (
		<SignedIn>
			<PasskeyGate>
				<CreateView />
			</PasskeyGate>
		</SignedIn>
	);
}
