"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@hypercore/ui/components/card";
import { Field, FieldLabel } from "@hypercore/ui/components/field";
import { Input } from "@hypercore/ui/components/input";
import { Separator } from "@hypercore/ui/components/separator";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";

interface Passkey {
  id: string;
  name?: string | null;
  createdAt?: string | null;
}

export default function Page() {
  const { data, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"profile" | "passkey" | null>(null);
  const [error, setError] = useState("");
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);

  useEffect(() => {
    if (data?.user?.name) setName(data.user.name);
  }, [data?.user?.name]);

  const loadPasskeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch(`${env.API_URL}/api/auth/passkey/list-user-passkeys`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      setPasskeys(Array.isArray(json) ? json : (json?.passkeys ?? []));
    } catch {
      setPasskeys([]);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (!isPending) void loadPasskeys();
  }, [isPending]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("profile");
    setError("");
    setSaved(false);
    try {
      const { error } = await authClient.updateUser({ name });
      if (error) {
        setError(error.message ?? "Could not update profile.");
        return;
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(null);
    }
  };

  const addPasskey = async () => {
    setBusy("passkey");
    setError("");
    try {
      const { error } = await authClient.passkey.addPasskey({
        authenticatorAttachment: "platform",
      });
      if (error) {
        setError(error.message ?? "Could not register a passkey.");
        return;
      }
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register a passkey.");
    } finally {
      setBusy(null);
    }
  };

  const deletePasskey = async (id: string) => {
    try {
      await fetch(`${env.API_URL}/api/auth/passkey/delete-passkey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete passkey.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile details and passkeys for your account.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your display name and email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(e) => void saveProfile(e)}>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" value={data?.user?.email ?? ""} readOnly disabled />
              </Field>
              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {saved && (
                <p className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm">
                  Profile updated.
                </p>
              )}
              <Button type="submit" disabled={busy === "profile"}>
                {busy === "profile" && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Passkeys</CardTitle>
            <CardDescription>
              Passwordless sign-in is required before deploying code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingKeys ? (
              <p className="text-sm text-muted-foreground">Loading passkeys…</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No passkeys yet. Add one to enable one-tap sign-in.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {passkeys.map((key) => (
                  <li key={key.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{key.name || "Passkey"}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void deletePasskey(key.id)}
                      title="Remove passkey"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Separator />
            <Button onClick={() => void addPasskey()} disabled={busy === "passkey"}>
              {busy === "passkey" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Fingerprint />
              )}
              Add a passkey
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
