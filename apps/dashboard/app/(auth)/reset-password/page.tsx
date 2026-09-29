import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordView } from "@/modules/auth/reset-password-view";
import { SignedOut } from "@/modules/auth/components/signed-out";
import { Spinner } from "@hypercore/ui/components/spinner";

export const metadata: Metadata = {
  title: "Choose a new password | HyperCore",
  description: "Choose a new password for your HyperCore console account.",
};

export default function Page() {
  return (
    <SignedOut>
      <Suspense
        fallback={
          <div className="flex min-h-svh items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <ResetPasswordView />
      </Suspense>
    </SignedOut>
  );
}
