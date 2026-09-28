import type { Metadata } from "next";
import { LandingView } from "@/modules/landing/landing-view";

export const metadata: Metadata = {
  title: "Hypercore — Volunteer Compute for Serverless Functions",
  description:
    "Write TypeScript functions and run them as WebAssembly on volunteer edge machines. Control plane, SSE scheduler, and Tauri agents.",
};

export default function Home() {
  return <LandingView />;
}
