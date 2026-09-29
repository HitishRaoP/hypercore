import type { Metadata } from "next";
import { SignUpView } from "@/modules/auth/sign-up-view";
import { SignedOut } from "@/modules/auth/components/signed-out";

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
