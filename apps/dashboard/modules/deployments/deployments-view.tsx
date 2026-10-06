"use client";

import { Badge } from "@hypercore/ui/components/badge";
import { Button } from "@hypercore/ui/components/button";
import { Card } from "@hypercore/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@hypercore/ui/components/table";
import { ChevronRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type Deployment, fetchMyDeployments } from "@/lib/api";
import { deploymentLabel, deploymentTone } from "@/lib/format";

export function DeploymentsView() {
	const router = useRouter();
	const [deployments, setDeployments] = useState<Deployment[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = async () => {
		setLoading(true);
		try {
			setDeployments(await fetchMyDeployments());
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, []);

	// Latest deployment per worker counts as "current".
	const currentIds = useMemo(() => {
		const latest = new Map<string, Deployment>();
		for (const d of deployments) {
			const prev = latest.get(d.workerName);
			if (
				!prev ||
				new Date(d.createdAt) > new Date(prev.createdAt)
			) {
				latest.set(d.workerName, d);
			}
		}
		return new Set([...latest.values()].map((d) => d.deploymentId));
	}, [deployments]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Deployments
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Functions you have deployed to the HyperCore
						network. Select a row for details.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => void refresh()}
						disabled={loading}
					>
						<RefreshCw
							className={
								loading ? "animate-spin" : ""
							}
						/>
						Refresh
					</Button>
					<Button size="sm" asChild>
						<Link href="/create">New deployment</Link>
					</Button>
				</div>
			</div>

			<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
				<div className="min-h-0 flex-1 overflow-auto">
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-card">
							<TableRow>
								<TableHead className="pl-6">
									Worker
								</TableHead>
								<TableHead>
									Deployment
								</TableHead>
								<TableHead>Node</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="pr-6 text-right">
									Details
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{deployments.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="px-6 py-8 text-center text-sm text-muted-foreground"
									>
										{loading
											? "Loading deployments…"
											: "No deployments yet — create your first function."}
									</TableCell>
								</TableRow>
							) : (
								deployments.map((d) => (
									<TableRow
										key={d.deploymentId}
										onClick={() =>
											router.push(
												`/deployments/${d.deploymentId}`,
											)
										}
										className="cursor-pointer"
									>
										<TableCell className="max-w-48 truncate pl-6 font-medium">
											{d.workerName}
											{currentIds.has(
												d.deploymentId,
											) && (
												<Badge
													variant="secondary"
													className="ml-2"
												>
													Latest
												</Badge>
											)}
										</TableCell>
										<TableCell className="font-mono text-sm text-muted-foreground">
											{d.deploymentId.slice(
												0,
												8,
											)}
										</TableCell>
										<TableCell className="font-mono text-sm text-muted-foreground">
											{d.machineId.slice(
												0,
												8,
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant={deploymentTone(
													d.status,
												)}
											>
												{deploymentLabel(
													d.status,
												)}
											</Badge>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{new Date(
												d.createdAt,
											).toLocaleString()}
										</TableCell>
										<TableCell className="pr-6 text-right">
											<ChevronRight className="ml-auto size-4 text-muted-foreground" />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
				<div className="shrink-0 border-t bg-muted/40 px-6 py-3">
					<p className="font-mono text-sm text-muted-foreground uppercase">
						{deployments.length} deployment
						{deployments.length === 1 ? "" : "s"}
					</p>
				</div>
			</Card>
		</div>
	);
}
