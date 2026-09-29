"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
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

export function ResetPasswordView() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (error) {
        setError(error.message ?? "Could not reset your password.");
        return;
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset your password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>
            {done
              ? "Your password has been reset"
              : token
                ? "Choose a new password"
                : "This link is no longer valid"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Sign in with your new password to continue."
              : token
                ? "Pick something you have not used before."
                : "The reset link has expired or has already been used."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="shrink-0" />
              Your other sessions stay signed in.
            </div>
          ) : !token ? null : (
            <form className="space-y-4" onSubmit={(e) => void resetPassword(e)}>
              <Field>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Reset password
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          {done ? (
            <Button variant="outline" onClick={() => router.replace("/sign-in")}>
              Back to sign in
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {token ? (
                <>
                  Remembered it?{" "}
                  <Link href="/sign-in" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </>
              ) : (
                <Link href="/forgot-password" className="underline underline-offset-4">
                  Request a new link
                </Link>
              )}
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
