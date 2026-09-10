"use client";

import { CheckCircle2 } from "lucide-react";

import { Button } from "@hypercore/ui/components/button";
import { Input } from "@hypercore/ui/components/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";

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
};`;

interface HWTemplateProps {
  onBack: () => void;
}

export const HWTemplate = ({ onBack }: HWTemplateProps) => {
  return (
    <Card className="flex max-h-[calc(100vh-228px)] w-1/2 sm:w-2/3 md:w-full flex-col overflow-hidden pb-0">

      <CardHeader className="shrink-0">
        <h1 className="text-xl">Deploy Hello World</h1>
        <p className="text-sm text-muted-foreground">
          A simple Worker that returns &apos;Hello World!&apos;. Perfect for
          getting started.
        </p>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 space-y-6 overflow-y-auto pb-6">
        <div className="space-y-2">
          <label className="text-[16px] font-medium">Worker name</label>
          <div className="relative">
            <Input
              defaultValue="long-poetry-3588"
              className="h-[45px] rounded-xl pr-[220px] text-[16px]"
            />

            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-1 text-[16px]">
              <span>.hitish.hypercore.dev</span>
              <CheckCircle2 className="ml-2 h-5 w-5 text-blue-500" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[16px] font-medium">Worker preview</label>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <pre className="overflow-x-auto overflow-hidden whitespace-pre font-mono text-[14px] leading-6">
              <code>{workerCode}</code>
            </pre>
          </div>
        </div>
      </CardContent>

      <CardFooter className="m-0 flex shrink-0 items-center justify-between border-t bg-muted/40 px-5 py-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  );
};
