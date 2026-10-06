import { Button } from "@hypercore/ui/components/button";
import { Card, CardContent } from "@hypercore/ui/components/card";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { MachineDetailsCard } from "../components/MachineDetailsCard";
import type { MachineInfo, RegistrationResponse } from "../types";

export function MachinePage({
	info,
	registration,
	coordinatorUrl,
}: {
	info: MachineInfo | null;
	registration: RegistrationResponse;
	coordinatorUrl: string;
}) {
	const [copied, setCopied] = useState(false);
	const machineId = info?.machineId ?? "";
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(machineId);
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
					Machine
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Identity and hardware of this worker node.
				</p>
			</div>
			<div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto pb-1">
				<Card>
					<CardContent className="flex flex-wrap items-center gap-4">
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
								Machine ID
							</p>
							<button
								onClick={() => void copy()}
								title="Copy machine ID"
								className="mt-1 flex max-w-full items-center gap-2 font-mono text-sm transition-colors hover:text-muted-foreground"
							>
								<span className="truncate">
									{machineId}
								</span>
								{copied ? (
									<Check className="size-3.5 shrink-0" />
								) : (
									<Copy className="size-3.5 shrink-0 text-muted-foreground" />
								)}
							</button>
							<p className="mt-2 font-mono text-sm break-all text-muted-foreground">
								Node {registration.nodeId} ·{" "}
								{registration.assignedRegion} ·{" "}
								{coordinatorUrl}
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void copy()}
						>
							{copied ? "Copied" : "Copy ID"}
						</Button>
					</CardContent>
				</Card>
				{info && <MachineDetailsCard info={info} />}
			</div>
		</div>
	);
}
