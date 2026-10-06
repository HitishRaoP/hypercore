"use client";

import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Text,
} from "@react-email/components";
import React from "react";

type ResetPasswordEmailProps = {
	siteName?: string;
};

export default function ResetPasswordEmail({
	siteName = "Hypercore",
}: ResetPasswordEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>Your {siteName} password was changed</Preview>
			<Body
				style={{
					margin: 0,
					backgroundColor: "#f3f4f6",
					fontFamily:
						'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
				}}
			>
				<Container
					style={{
						maxWidth: "480px",
						margin: "40px auto",
						padding: "32px 24px",
						backgroundColor: "#ffffff",
						borderRadius: "12px",
						border: "1px solid #e5e7eb",
					}}
				>
					<Heading
						style={{
							fontSize: "24px",
							margin: "0 0 12px",
							color: "#111827",
						}}
					>
						Your password has been reset
					</Heading>

					<Text
						style={{
							fontSize: "14px",
							lineHeight: "22px",
							color: "#4b5563",
							margin: "0 0 16px",
						}}
					>
						This is a confirmation that the password for
						your {siteName} account was just changed.
					</Text>

					<Text
						style={{
							fontSize: "14px",
							lineHeight: "22px",
							color: "#4b5563",
							margin: "0 0 8px",
						}}
					>
						If you made this change, no further action
						is required.
					</Text>

					<Text
						style={{
							fontSize: "14px",
							lineHeight: "22px",
							color: "#b91c1c",
							margin: "16px 0 0",
						}}
					>
						If you did <strong>not</strong> reset your
						password, please secure your account
						immediately by resetting your password again
						and contacting support.
					</Text>

					<Text
						style={{
							fontSize: "12px",
							lineHeight: "18px",
							color: "#9ca3af",
							marginTop: "24px",
						}}
					>
						— The {siteName} team
					</Text>
				</Container>
			</Body>
		</Html>
	);
}
