import { Suspense } from "react";
import { DeploymentsView } from "@/modules/deployments/deployments-view";

export default function Page() {
	return (
		<Suspense
			fallback={
				<p className="text-sm text-muted-foreground">
					Loading deployments…
				</p>
			}
		>
			<DeploymentsView />
		</Suspense>
	);
}
