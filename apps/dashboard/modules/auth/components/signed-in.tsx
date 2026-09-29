"use server"

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { env } from "@/lib/env";

/** Server-side guard: renders children only with a valid API session. */
export async function SignedIn({ children }: { children: ReactNode }) {
  const headersList = await headers();
  let signedIn = false;
  try {
    const response = await fetch(`${env.BACKEND_SERVER_URL}/api/auth/get-session`, {
      headers: Object.fromEntries(headersList.entries()),
      cache: "no-store",
    });
    const session = await response.json().catch(() => null);
    signedIn = Boolean(session?.session ?? session?.user);
  } catch {
    signedIn = false;
  }
  if (!signedIn) {
    redirect("/sign-in");
  }
  return <>{children}</>;
}
