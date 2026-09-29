"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@hypercore/ui/components/card";
import { env } from "@/lib/env";

/** Blocks deploying until the account owns at least one passkey. */
export function PasskeyGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${env.API_URL}/api/auth/passkey/list-user-passkeys`,
          { credentials: "include" },
        );
        const json = await res.json().catch(() => null);
        const keys = Array.isArray(json) ? json : (json?.passkeys ?? []);
        if (!cancelled) setState(keys.length > 0 ? "ok" : "missing");
      } catch {
        if (!cancelled) setState("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking passkeys…
      </div>
    );
  }

  if (state === "missing") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="size-5" />
            Add a passkey to deploy
          </CardTitle>
          <CardDescription>
            Passkey authentication is required before you can deploy code to
            the network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/settings">Go to settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
