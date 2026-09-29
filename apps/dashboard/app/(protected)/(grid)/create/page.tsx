import type { Metadata } from "next";
import { CreateView } from "@/modules/create/create-view";
import { PasskeyGate } from "@/modules/create/passkey-gate";
import { SignedIn } from "@/modules/auth/components/signed-in";

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
