import type { ReactNode } from "react";
import { SignedIn } from "@/modules/auth/components/signed-in";
import { ProtectedShell } from "@/components/protected-shell";

export default function ProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <SignedIn>
      <ProtectedShell>{children}</ProtectedShell>
    </SignedIn>
  );
}
