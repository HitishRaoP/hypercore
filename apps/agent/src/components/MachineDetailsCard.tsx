import { Button } from "@hypercore/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@hypercore/ui/components/card";
import { Check, Copy, Cpu, Database, Monitor, Network } from "lucide-react";
import { useState } from "react";
import type { MachineInfo } from "../types";

const mb = (value: number) => `${(value / 1024).toFixed(1)} GB`;

export function MachineDetailsCard({ info }: { info: MachineInfo }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		await navigator.clipboard.writeText(info.machineId);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	};
	const cells = [
		{
			icon: Monitor,
			label: "Host / OS",
			value: `${info.hostname} · ${info.osName} ${info.osVersion}`,
		},
		{
			icon: Cpu,
			label: "Compute",
			value: `${info.cpuBrand} · ${info.cpuLogicalCores} logical / ${info.cpuPhysicalCores} physical`,
		},
		{
			icon: Database,
			label: "Memory / Disk",
			value: `${mb(info.usedMemoryMb)} / ${mb(info.totalMemoryMb)} · ${mb(info.availableDiskMb)} free`,
		},
		{
			icon: Network,
			label: "Network",
			value: `${info.localIp} · ${info.arch} · kernel ${info.kernelVersion}`,
		},
	];
	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Machine details</CardTitle>
						<CardDescription>
							Native hardware probe completed
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void copy()}
						className="font-mono"
					>
						{info.machineId.slice(0, 18)}…
						{copied ? <Check /> : <Copy />}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid gap-5 sm:grid-cols-2">
					{cells.map(({ icon: Icon, label, value }) => (
						<div key={label}>
							<p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<Icon className="size-3.5" />
								{label}
							</p>
							<p className="mt-1.5 font-mono text-sm leading-5">
								{value}
							</p>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
