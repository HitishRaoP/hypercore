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

export function SignUpView() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState<"account" | "passkey" | "skip" | null>(
		null,
	);
	const [created, setCreated] = useState(false);

	const createAccount = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy("account");
		setError("");
		try {
			const { error } = await authClient.signUp.email({
				name,
				email,
				password,
			});
			if (error) {
				setError(error.message ?? "Sign up failed.");
				return;
			}
			setCreated(true);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Sign up failed.",
			);
		} finally {
			setBusy(null);
		}
	};

	const addPasskey = async () => {
		setBusy("passkey");
		setError("");
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: "Primary passkey",
				authenticatorAttachment: "platform",
			});
			if (error) {
				setError(
					error.message ?? "Could not register a passkey.",
				);
				return;
			}
			router.replace("/deployments");
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Could not register a passkey.",
			);
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle>
						{created
							? "Secure your account"
							: "Create an account"}
					</CardTitle>
					<CardDescription>
						{created
							? "Add a passkey so you can sign in without a password."
							: "Sign up with your email, then add a passkey."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{!created ? (
						<form
							className="space-y-4"
							onSubmit={(e) =>
								void createAccount(e)
							}
						>
							<Field>
								<FieldLabel htmlFor="name">
									Name
								</FieldLabel>
								<Input
									id="name"
									autoComplete="name"
									required
									value={name}
									onChange={(e) =>
										setName(
											e.target
												.value,
										)
									}
									placeholder="Ada Lovelace"
								/>
							</Field>
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
										setEmail(
											e.target
												.value,
										)
									}
									placeholder="you@example.com"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="password">
									Password
								</FieldLabel>
								<Input
									id="password"
									type="password"
									autoComplete="new-password"
									required
									minLength={8}
									value={password}
									onChange={(e) =>
										setPassword(
											e.target
												.value,
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
								className="w-full"
								disabled={busy !== null}
							>
								{busy === "account" && (
									<Loader2 className="animate-spin" />
								)}
								Create account
							</Button>
						</form>
					) : (
						<>
							<Button
								className="w-full"
								disabled={busy !== null}
								onClick={() =>
									void addPasskey()
								}
							>
								{busy === "passkey" ? (
									<Loader2 className="animate-spin" />
								) : (
									<Fingerprint />
								)}
								Add a passkey
							</Button>
							{error && (
								<p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{error}
								</p>
							)}
							<Button
								variant="outline"
								className="w-full"
								disabled={busy !== null}
								onClick={() =>
									router.replace(
										"/deployments",
									)
								}
							>
								Skip for now
							</Button>
						</>
					)}
				</CardContent>
				{!created && (
					<CardFooter className="justify-center">
						<p className="text-sm text-muted-foreground">
							Already have an account?{" "}
							<Link
								href="/sign-in"
								className="underline underline-offset-4"
							>
								Sign in
							</Link>
						</p>
					</CardFooter>
				)}
			</Card>
		</div>
	);
}
