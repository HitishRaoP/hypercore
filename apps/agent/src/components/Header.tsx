import { Boxes } from "lucide-react";
import { Badge } from "@hypercore/ui/components/badge";

export function Header({ online }: { online: boolean }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg border bg-muted">
            <Boxes className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">
              HyperCore <span className="font-normal text-muted-foreground">Worker Node</span>
            </h1>
            <p className="text-xs text-muted-foreground">Control plane agent</p>
          </div>
        </div>
        <Badge variant={online ? "default" : "secondary"}>
          <span
            className={`size-1.5 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"}`}
          />
          {online ? "Connected" : "Idle"}
        </Badge>
      </div>
    </header>
  );
}
