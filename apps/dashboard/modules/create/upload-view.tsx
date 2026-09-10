"use client"

import { useRef, useState } from "react"
import { FolderOpen } from "lucide-react"
import { Button } from "@hypercore/ui/components/button"
import { Card } from "@hypercore/ui/components/card"

export function UploadView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>("")

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (file) {
      setFileName(file.name)
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Main content */}
      <main className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        {/* Left navigation */}
        <aside className="border-r border-zinc-200">
          <div className="flex justify-end px-8 pt-56">
          </div>
        </aside>

        {/* Center */}
        <section className="flex justify-center px-8 pt-12">
          <Card className="w-full max-w-[700px] overflow-hidden rounded-2xl border-zinc-200 shadow-none">
            {/* Card content */}
            <div className="px-8 pb-8 pt-7">
              <h1 className="text-[21px] font-medium tracking-tight">
                Upload and deploy
              </h1>

              <p className="mt-1 text-[15px] text-zinc-500">
                Drag and drop your static files and configure deployment
                settings.
              </p>

              {/* Dropzone */}
              <div
                onClick={() => inputRef.current?.click()}
                className="mt-7 flex h-[212px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white transition-colors hover:bg-zinc-50"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300">
                  <FolderOpen className="h-5 w-5 text-zinc-500" />
                </div>

                <p className="text-[16px] text-zinc-700">
                  Drag in or click to{" "}
                  <span className="underline underline-offset-2">
                    upload a file or folder
                  </span>
                  .
                </p>

                <p className="mt-2 text-sm text-zinc-500">
                  Contents you drag here will be uploaded to your account
                </p>

                {fileName && (
                  <p className="mt-3 text-sm font-medium text-zinc-900">
                    Selected: {fileName}
                  </p>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-4">
              <Button
                variant="ghost"
                className="px-0 text-[16px] font-normal hover:bg-transparent"
              >
                Back
              </Button>

              <Button
                disabled={!fileName}
                className="rounded-lg bg-blue-500 px-4 text-white hover:bg-blue-600 disabled:bg-blue-300"
              >
                Deploy
              </Button>
            </div>
          </Card>
        </section>

        {/* Right navigation */}
        <aside className="border-l border-zinc-200">
          <div className="px-8 pt-56">
            <div className="space-y-4 text-sm">

            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}