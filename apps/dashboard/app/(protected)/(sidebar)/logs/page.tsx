import { Suspense } from "react";
import { LogsView } from "@/modules/logs/logs-view";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading logs…</p>}>
      <LogsView />
    </Suspense>
  );
}
