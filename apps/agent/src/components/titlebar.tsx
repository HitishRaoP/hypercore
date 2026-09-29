import { getCurrentWindow } from "@tauri-apps/api/window";
import { Boxes, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

function inTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const tauri = inTauri();

  useEffect(() => {
    if (!tauri) return;
    getCurrentWindow()
      .isMaximized()
      .then(setMaximized)
      .catch(() => null);
  }, [tauri]);

  const minimize = () => {
    if (!tauri) return;
    getCurrentWindow().minimize().catch(() => null);
  };

  const close = () => {
    if (!tauri) return;
    getCurrentWindow().close().catch(() => null);
  };

  const toggleMaximize = async () => {
    if (!tauri) return;
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    } catch {
      /* window controls unavailable */
    }
  };

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={() => void toggleMaximize()}
      className="flex h-9 shrink-0 items-center justify-between bg-black text-white select-none"
    >
      <div className="flex items-center gap-2 px-3">
        <Boxes className="size-3.5" />
        <span className="text-xs font-medium">HyperCore Agent</span>
      </div>
      {tauri && (
        <div className="flex h-full items-stretch">
          <button
            onClick={minimize}
            title="Minimize"
            aria-label="Minimize"
            className="grid w-12 cursor-pointer place-items-center transition-colors hover:bg-white/10"
          >
            <Minus className="size-4" />
          </button>
          <button
            onClick={() => void toggleMaximize()}
            title={maximized ? "Restore" : "Maximize"}
            aria-label={maximized ? "Restore" : "Maximize"}
            className="grid w-12 cursor-pointer place-items-center transition-colors hover:bg-white/10"
          >
            <Square className="size-3.5" />
          </button>
          <button
            onClick={close}
            title="Close"
            aria-label="Close"
            className="grid w-12 cursor-pointer place-items-center transition-colors hover:bg-[#e81123]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </header>
  );
}
