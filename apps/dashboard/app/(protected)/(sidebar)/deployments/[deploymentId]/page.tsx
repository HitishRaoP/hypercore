import { Suspense } from "react";
import { DeploymentDetailsView } from "@/modules/deployments/deployment-details-view";

export default async function Page({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const { deploymentId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading deployment…</p>}>
      <DeploymentDetailsView deploymentId={deploymentId} />
    </Suspense>
  );
}
