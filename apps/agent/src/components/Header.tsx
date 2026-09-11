import { Boxes } from "lucide-react";
import { Badge } from "./ui/Badge";
export function Header({ online }: { online: boolean }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-900 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-lg border border-zinc-700 bg-zinc-900">
          <Boxes className="size-4 text-zinc-200" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
            HyperCore <span className="text-zinc-500">Worker Node</span>
          </h1>
          <p className="text-[11px] text-zinc-600">Control plane agent</p>
        </div>
      </div>
      <Badge
        className={
          online
            ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-400"
            : "border-zinc-800 bg-zinc-900 text-zinc-500"
        }
      >
        <i
          className={`size-1.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" : "bg-zinc-600"}`}
        />
        {online ? "Connected" : "Idle"}
      </Badge>
    </header>
  );
}
