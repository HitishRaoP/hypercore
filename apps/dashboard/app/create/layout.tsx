import {
  Cloud,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react"

import { Button } from "@hypercore/ui/components/button"


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="relative min-h-screen overflow-hidden">
          {/* Top navigation */}
      <header className="h-[72px] border-t-2 border-t-zinc-900 border-b bg-white">
        <div className="flex h-full items-center justify-between px-8">
          {/* Account */}
          <div className="flex items-center gap-4">
            <div className="text-orange-500">
              <Cloud className="h-9 w-9 fill-current" />
            </div>

            <span className="text-sm font-medium sm:text-base">
              Chirags1208@gmail.com&apos;s Account
            </span>

            <div className="flex flex-col text-zinc-500">
              <ChevronUp className="h-3 w-3" />
              <ChevronDown className="h-3 w-3" />
            </div>
          </div>

          {/* Ask AI */}
          <div className="flex items-center gap-2">

            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-8 w-8 text-zinc-500"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

          {/* Background
          <div className="absolute inset-0 z-0">
            <Background />
          </div> */}

          {/* Website content */}
          <div className="relative z-10">
        {/* Grid lines */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block">

        {/* Vertical */}
        <div className="absolute left-[26.25%] top-0 h-full border-l border-dashed border-zinc-200" />
        <div className="absolute right-[26.25%] top-0 h-full border-r border-dashed border-zinc-200" />

        {/* Horizontal */}
        <div className="absolute left-0 top-[15%] w-full border-t border-dashed border-zinc-200" />
        <div className="absolute left-0 top-[30%] w-full border-t border-dashed border-zinc-200" />
        <div className="absolute left-0 top-[45%] w-full border-t border-dashed border-zinc-200" />
        <div className="absolute left-0 top-[60%] w-full border-t border-dashed border-zinc-200" />

        </div>

            {children}
          </div>

        </div>
      </body>
    </html>
  );
}