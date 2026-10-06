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
import { RefreshCw } from "lucide-react";
import { deploymentVariant, shortId, timeAgo } from "../lib/activity";
import type { ActivityDeployment } from "../types";

export function DeploymentsPage({
	deployments,
	updatedAt,
	error,
	refreshing,
	onRefresh,
}: {
	deployments: ActivityDeployment[];
	updatedAt: number | null;
	error: string;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Deployments
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{updatedAt
							? `Updated ${timeAgo(new Date(updatedAt).toISOString())}`
							: "Deployments routed to this node."}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={onRefresh}
					disabled={refreshing}
				>
					<RefreshCw
						className={refreshing ? "animate-spin" : ""}
					/>
					Refresh
				</Button>
			</div>

			{error && deployments.length === 0 ? (
				<Card>
					<div className="p-8 text-center">
						<p className="text-sm font-medium">
							Could not reach the coordinator
						</p>
						<p className="mt-1 font-mono text-sm text-muted-foreground">
							{error}
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							className="mt-4"
						>
							Retry
						</Button>
					</div>
				</Card>
			) : (
				<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
					<div className="scroll-thin table-scroll min-h-0 flex-1 overflow-auto">
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-card">
								<TableRow>
									<TableHead className="pl-6">
										Deployment
									</TableHead>
									<TableHead>ID</TableHead>
									<TableHead>
										Entrypoint
									</TableHead>
									<TableHead>
										Status
									</TableHead>
									<TableHead className="pr-6 text-right">
										Created
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{deployments.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={5}
											className="px-6 py-8 text-center text-sm text-muted-foreground"
										>
											No deployments
											routed to this
											node yet.
										</TableCell>
									</TableRow>
								) : (
									deployments.map(
										(deployment) => (
											<TableRow
												key={
													deployment.deploymentId
												}
											>
												<TableCell className="max-w-48 truncate pl-6 font-medium">
													{
														deployment.workerName
													}
												</TableCell>
												<TableCell
													className="font-mono text-sm text-muted-foreground"
													title={
														deployment.deploymentId
													}
												>
													{shortId(
														deployment.deploymentId,
													)}
												</TableCell>
												<TableCell className="font-mono text-sm text-muted-foreground">
													{
														deployment.entrypoint
													}
												</TableCell>
												<TableCell>
													<Badge
														variant={deploymentVariant(
															deployment.status,
														)}
													>
														{
															deployment.status
														}
													</Badge>
												</TableCell>
												<TableCell className="pr-6 text-right text-sm text-muted-foreground">
													{timeAgo(
														deployment.createdAt,
													)}
												</TableCell>
											</TableRow>
										),
									)
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
			)}
		</div>
	);
}
