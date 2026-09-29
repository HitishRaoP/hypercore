"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Spinner } from "@hypercore/ui/components/spinner";

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
