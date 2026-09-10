"use client"

import {
  CheckCircle2,
  LockKeyhole,
} from "lucide-react"

import { Button } from "@hypercore/ui/components/button"
import { Input } from "@hypercore/ui/components/input"
import { Switch } from "@hypercore/ui/components/switch"
import {
  Card,
  CardContent,
  CardFooter,
} from "@hypercore/ui/components/card"

const workerCode = `/**
 * Welcome to HyperCore Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(request, env, ctx) {
    // You can view your logs in the Observability dashboard
    console.info({ message: 'Hello World Worker received a request!' });
    return new Response('Hello World!');
  }
};`

export function DeployView() {
  return (
    <div className="min-h-screen bg-white">
      {/* Main */}
      <main className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[25.5%_48%_26.5%]">
          {/* Left column */}
          <div className="pt-[218px] text-center">
          </div>

          {/* Center */}
          <div className="px-8 pt-[210px]">
            <Card className="mx-auto max-w-[660px] overflow-hidden rounded-2xl border-zinc-200 shadow-sm">
              <CardContent className="space-y-6 p-8">
                {/* Description */}
                <p className="text-[16px] leading-6 text-zinc-500">
                  A simple Worker that returns &apos;Hello World!&apos;.
                  Perfect for getting started.
                </p>

                {/* Worker name */}
                <div className="space-y-2">
                  <label className="text-[16px] font-medium">
                    Worker name
                  </label>

                  <div className="relative">
                    <Input
                      defaultValue="long-poetry-3588"
                      className="h-[45px] rounded-xl pr-[220px] text-[16px]"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-1 text-[16px] text-zinc-500">
                      <span>.chirags1208.workers.dev</span>

                      <CheckCircle2 className="ml-2 h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                </div>

                {/* Worker preview */}
                <div className="space-y-2">
                  <label className="text-[16px] font-medium">
                    Worker preview
                  </label>

                  <div className="h-[397px] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                    <pre className="overflow-x-auto whitespace-pre font-mono text-[14px] leading-6 text-zinc-500">
                      <code>{workerCode}</code>
                    </pre>
                  </div>
                </div>

                {/* Cloudflare Access */}
                <div className="flex h-[55px] items-center justify-between rounded-xl border border-zinc-200 px-4">
                  <div className="flex items-center gap-3">
                    <LockKeyhole className="h-5 w-5 text-zinc-400" />

                    <span className="text-[16px] font-medium">
                      Protect with Cloudflare Access
                    </span>
                  </div>

                  <Switch />
                </div>
              </CardContent>

              {/* Bottom buttons */}
              <CardFooter className="flex h-[55px] justify-between border-t border-zinc-200 bg-zinc-50 px-6">
                <Button
                  variant="ghost"
                  className="text-[16px] font-medium"
                >
                  Back
                </Button>

                <Button className="h-[42px] rounded-xl bg-blue-600 px-5 text-[16px] hover:bg-blue-700">
                  Deploy
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Right column */}
          {/* <div className="hidden pt-[218px] lg:block">
            <div className="ml-8 space-y-3 text-[16px]">
              <div className="flex items-center gap-3 text-zinc-500">
                <span className="text-[18px]">○</span>
                <span>Select a method</span>
              </div>

              <div className="flex items-center gap-3 font-medium text-zinc-800">
                <span className="text-[18px]">●</span>
                <span>Deploy Worker</span>
              </div>
            </div>
          </div> */}
        </div>
      </main>
    </div>
  )
}