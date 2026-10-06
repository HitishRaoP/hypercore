"use client";

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
import { Fingerprint, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInView() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState<"password" | "passkey" | null>(null);

	const withBusy = async (
		kind: "password" | "passkey",
		fn: () => Promise<{ error: unknown }>,
	) => {
		setBusy(kind);
		setError("");
		try {
			const { error } = await fn();
			if (error) {
				setError(
					error instanceof Error
						? error.message
						: "Sign in failed.",
				);
				return;
			}
			router.replace("/deployments");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Sign in failed.",
			);
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle>Welcome back</CardTitle>
					<CardDescription>
						Sign in with your passkey or email and
						password.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Button
						className="w-full"
						disabled={busy !== null}
						onClick={() =>
							void withBusy("passkey", () =>
								authClient.signIn.passkey(),
							)
						}
					>
						{busy === "passkey" ? (
							<Loader2 className="animate-spin" />
						) : (
							<Fingerprint />
						)}
						Continue with passkey
					</Button>
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<span className="h-px flex-1 bg-border" />
						or continue with email
						<span className="h-px flex-1 bg-border" />
					</div>
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void withBusy("password", () =>
								authClient.signIn.email({
									email,
									password,
								}),
							);
						}}
					>
						<Field>
							<FieldLabel htmlFor="email">
								Email
							</FieldLabel>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								required
								value={email}
								onChange={(e) =>
									setEmail(e.target.value)
								}
								placeholder="you@example.com"
							/>
						</Field>
						<Field>
							<div className="flex items-center justify-between gap-3">
								<FieldLabel htmlFor="password">
									Password
								</FieldLabel>
								<Link
									href="/forgot-password"
									className="text-sm text-muted-foreground underline underline-offset-4"
								>
									Forgot password?
								</Link>
							</div>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								required
								value={password}
								onChange={(e) =>
									setPassword(
										e.target.value,
									)
								}
							/>
						</Field>
						{error && (
							<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{error}
							</p>
						)}
						<Button
							type="submit"
							variant="outline"
							className="w-full"
							disabled={busy !== null}
						>
							{busy === "password" && (
								<Loader2 className="animate-spin" />
							)}
							Sign in
						</Button>
					</form>
				</CardContent>
				<CardFooter className="justify-center">
					<p className="text-sm text-muted-foreground">
						No account yet?{" "}
						<Link
							href="/sign-up"
							className="underline underline-offset-4"
						>
							Sign up
						</Link>
					</p>
				</CardFooter>
			</Card>
		</div>
	);
}
