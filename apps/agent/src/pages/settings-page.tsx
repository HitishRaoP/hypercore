import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import { Input } from "@hypercore/ui/components/input";
import { Label } from "@hypercore/ui/components/label";
import { Separator } from "@hypercore/ui/components/separator";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { Check, Copy, Download, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { UpdaterState } from "../hooks/use-updater";
import type { RegistrationResponse } from "../types";

function Row({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
			<Label className="text-muted-foreground">{label}</Label>
			<span className={mono ? "font-mono break-all" : ""}>
				{value}
			</span>
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
}

const PHASE_LABEL: Partial<Record<UpdaterState["phase"], string>> = {
	checking: "Checking for updates…",
	downloading: "Downloading",
	installing: "Installing",
};

export function SettingsPage({
	registration,
	coordinatorUrl,
	machineId,
	update,
	onCheckUpdate,
	onInstallUpdate,
	onUnregister,
}: {
	registration: RegistrationResponse;
	coordinatorUrl: string;
	machineId: string;
	update: UpdaterState;
	onCheckUpdate: () => void;
	onInstallUpdate: () => void;
	onUnregister: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [version, setVersion] = useState<string | null>(null);
	useEffect(() => {
		void getVersion()
			.then(setVersion)
			.catch(() => setVersion(null));
	}, []);
	const copyUrl = async () => {
		try {
			await navigator.clipboard.writeText(coordinatorUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
			<div className="shrink-0">
				<h2 className="text-xl font-semibold tracking-tight">
					Settings
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Connection, node identity, updates and build
					tools.
				</p>
			</div>

			<div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto pb-1">
				<Card className="gap-0 py-0">
					<div className="px-6 py-5">
						<h3 className="text-sm font-medium">
							Coordinator
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							The coordinator this node is
							registered with.
						</p>
						<div className="mt-4 flex gap-2">
							<Input
								value={coordinatorUrl}
								readOnly
								className="font-mono"
							/>
							<Button
								variant="outline"
								size="icon"
								onClick={() => void copyUrl()}
								title="Copy coordinator URL"
							>
								{copied ? <Check /> : <Copy />}
							</Button>
						</div>
					</div>
					<Separator />
					<div className="px-6 py-5">
						<h3 className="text-sm font-medium">
							Node
						</h3>
						<div className="mt-3 divide-y">
							<Row
								label="Node ID"
								value={registration.nodeId}
								mono
							/>
							<Row
								label="Machine ID"
								value={machineId}
								mono
							/>
							<Row
								label="Region"
								value={
									registration.assignedRegion
								}
							/>
							<Row
								label="Heartbeat"
								value={`every ${registration.heartbeatIntervalSecs}s`}
							/>
						</div>
					</div>
				</Card>

				<Card className="gap-0 py-0">
					<div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
						<div>
							<h3 className="text-sm font-medium">
								Agent updates
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								{update.phase === "available" &&
								update.version
									? `Version ${update.version} is ready to install.`
									: update.phase ===
												"downloading" &&
											update.totalBytes
										? `Downloading ${formatBytes(update.downloadedBytes)} of ${formatBytes(update.totalBytes)}…`
										: update.phase ===
												"installing"
											? "Installing — the app will restart on its own."
											: "The agent checks GitHub releases and updates itself in place."}
							</p>
							{update.notes &&
								update.phase ===
									"available" && (
									<p className="mt-2 max-w-prose whitespace-pre-line text-sm text-muted-foreground">
										{update.notes}
									</p>
								)}
							{update.error && (
								<p className="mt-2 max-w-prose text-sm text-destructive">
									{update.error}
								</p>
							)}
						</div>
						<div className="flex items-center gap-2">
							<span className="font-mono text-sm text-muted-foreground">
								{version ? `v${version}` : "—"}
							</span>
							{update.phase === "available" ? (
								<Button
									onClick={onInstallUpdate}
								>
									<Download />
									Install {update.version}
								</Button>
							) : update.phase === "installed" ? (
								<Button
									onClick={() =>
										void relaunch()
									}
								>
									<RefreshCw />
									Restart now
								</Button>
							) : (
								<Button
									variant="outline"
									disabled={
										update.phase ===
										"checking"
									}
									onClick={onCheckUpdate}
								>
									<RefreshCw
										className={
											update.phase ===
											"checking"
												? "animate-spin"
												: undefined
										}
									/>
									{update.phase ===
									"up-to-date"
										? "Check again"
										: "Check for updates"}
								</Button>
							)}
						</div>
					</div>
					{(update.phase === "downloading" ||
						update.phase === "installing") && (
						<div className="px-6 pb-5">
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full rounded-full bg-primary transition-[width]"
									style={{
										width: `${Math.round((update.progress ?? 0) * 100)}%`,
									}}
								/>
							</div>
							<p className="mt-2 text-xs text-muted-foreground">
								{PHASE_LABEL[update.phase]}
								{update.progress !== null &&
									` — ${Math.round(update.progress * 100)}%`}
							</p>
						</div>
					)}
				</Card>

				<Card className="border-destructive/40">
					<div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
						<div>
							<h3 className="text-sm font-medium">
								Disconnect this node
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								Forget the saved registration on
								this machine. You can
								re-register at any time.
							</p>
						</div>
						<Button
							variant="destructive"
							onClick={onUnregister}
						>
							<LogOut />
							Disconnect
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}
