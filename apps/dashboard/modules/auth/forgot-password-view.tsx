"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@hypercore/ui/components/card";
import { Field, FieldLabel } from "@hypercore/ui/components/field";
import { Input } from "@hypercore/ui/components/input";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // No `redirectTo`: better-auth origin-checks it against trustedOrigins
      // (DASHBOARD_URL only), so a dashboard opened via 127.0.0.1 would 403.
      // The reset link is built from DASHBOARD_URL in @hypercore/auth anyway.
      const { error } = await authClient.requestPasswordReset({ email });
      if (error) {
        setError(error.message ?? "Could not send the reset email.");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the reset email.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{sent ? "Check your inbox" : "Reset your password"}</CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, a reset link is on its way.`
              : "Enter your email and we will send you a link to choose a new password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              <MailCheck className="shrink-0" />
              The link expires in one hour.
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void requestReset(e)}>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/sign-in" className="underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
