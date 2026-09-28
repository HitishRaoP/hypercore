"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@hypercore/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@hypercore/ui/components/card";
import { Separator } from "@hypercore/ui/components/separator";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Bot,
  CalendarClock,
  Check,
  Cloud,
  Download,
  FileCode2,
  FileText,
  Globe,
  Image as ImageIcon,
  Menu,
  PlugZap,
  ScanFace,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

/* ================================ tokens ================================= */

const ACCENT = "#FF4D00";
const INK = "#0B0B0C";
const BLUE = "#2451F7";

/* ============================ shared keyframes ============================ */

function MotionStyles() {
  return (
    <style>{`
      @keyframes hc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes hc-floaty {
        0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
        50% { transform: translateY(-12px) rotate(var(--r, 0deg)); }
      }
      @keyframes hc-drift {
        from { transform: translate(0, 0); }
        to { transform: translate(-18px, -12px); }
      }
    `}</style>
  );
}

/* ================================= brand ================================= */

function HypercoreMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path
        d="M24 2 42 12.5v23L24 46 6 35.5v-23L24 2Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M24 13 33.5 18.5v11L24 35l-9.5-5.5v-11L24 13Z" fill={ACCENT} />
      <circle cx="24" cy="24" r="2.6" fill="currentColor" />
    </svg>
  );
}

function DottedPrefix() {
  return (
    <svg viewBox="0 0 28 12" className="h-3 w-7" aria-hidden>
      {[
        [1, 1], [7, 1], [13, 1],
        [1, 7], [7, 7], [13, 7], [19, 7], [25, 7],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="4" height="4" fill={ACCENT} opacity={i < 3 ? 0.45 : 1} />
      ))}
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs tracking-[0.22em] uppercase" style={{ color: ACCENT }}>
      <DottedPrefix />
      {children}
    </p>
  );
}

/* ============================ squared grid button ========================= */

/** Dotted plus ornament that sits in the squared button (orange on dark). */
function DottedPlus({ className = "h-7 w-7" }: { className?: string }) {
  const cells: Array<[number, number, boolean]> = [];
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const on = (r === 3 && c >= 1 && c <= 5) || (c === 3 && r >= 1 && r <= 5);
      cells.push([c, r, on]);
    }
  return (
    <svg viewBox="0 0 35 35" className={`shrink-0 ${className}`} aria-hidden>
      {cells.map(([c, r, on], i) => (
        <rect
          key={i}
          x={c * 5}
          y={r * 5}
          width="3"
          height="3"
          fill={on ? ACCENT : "#fff"}
          opacity={on ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

/** The single squared CTA style used across the whole page. */
function GridButton({
  href,
  children,
  size = "md",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-[6px] font-mono tracking-[0.14em] text-white uppercase transition-opacity hover:opacity-90 ${
        size === "sm" ? "gap-2.5 py-1 pr-1 pl-3.5 text-xs" : "gap-4 py-1.5 pr-1.5 pl-5 text-sm"
      } ${className}`}
      style={{ background: INK }}
    >
      <span className="flex items-center gap-2">{children}</span>
      <span className="rounded-[4px] border border-white/10 bg-white/10 p-1">
        <DottedPlus className={size === "sm" ? "h-5 w-5" : "h-7 w-7"} />
      </span>
    </Link>
  );
}

/* ============================== frame & fills ============================= */

/** Corner registration marks. `at` are left offsets (e.g. "0%", "50%"). */
function EdgeMarks({
  at,
  edge = "bottom",
  className = "",
}: {
  at: string[];
  edge?: "top" | "bottom";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 z-20 h-0 ${edge === "top" ? "top-0" : "bottom-0"} ${className}`}
    >
      {at.map((left) => (
        <span
          key={left}
          className="absolute top-0 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 border border-neutral-400 bg-white shadow-[0_0_0_3px_white]"
          style={{ left }}
        />
      ))}
    </div>
  );
}

function Hatch() {
  return (
    <div aria-hidden className="relative -mt-px border-b border-neutral-200">
      <div
        className="h-10 w-full sm:h-12"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-55deg, transparent 0 10px, rgba(0,0,0,0.10) 10px 13px)",
          backgroundColor: "#fafafa",
        }}
      />
      <EdgeMarks at={["0%", "100%"]} />
    </div>
  );
}

/** Halftone dot field with a soft orange glow + slow drift animation. */
function Halftone({ className = "" }: { className?: string }) {
  const dots = [];
  const cols = 44;
  const rows = 26;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const nx = c / cols - 0.5;
      const ny = r / rows - 0.5;
      const d = Math.sqrt(nx * nx * 2.2 + ny * ny * 2.2);
      const r0 = Math.max(0.4, 2.6 * (1 - d));
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={8 + c * 12}
          cy={8 + r * 12}
          r={r0}
          fill="#0B0B0C"
          opacity={0.05 + Math.max(0, 0.28 * (1 - d))}
        />,
      );
    }
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      <div
        className="absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl"
        style={{ background: ACCENT, opacity: 0.16 }}
      />
      <div
        className="absolute -right-16 -bottom-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: ACCENT, opacity: 0.1 }}
      />
      <div className="absolute -inset-6" style={{ animation: "hc-drift 9s ease-in-out infinite alternate" }}>
        <svg viewBox="0 0 544 328" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          {dots}
        </svg>
      </div>
    </div>
  );
}

/** Wind / flow dash field — kept faint so copy always stays legible. */
function FlowField({ className = "" }: { className?: string }) {
  const dashes = [];
  const cols = 22;
  const rows = 14;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const bend = Math.sin((c / cols) * Math.PI * 2 + r * 0.35) * 22;
      dashes.push(
        <line
          key={`${r}-${c}`}
          x1={14 + c * 24}
          y1={16 + r * 22}
          x2={14 + c * 24 + 10}
          y2={16 + r * 22 + bend * 0.12}
          stroke="#52525b"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity={0.1 + (c / cols) * 0.16}
        />,
      );
    }
  return (
    <svg viewBox="0 0 556 324" className={`absolute inset-0 h-full w-full ${className}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {dashes}
    </svg>
  );
}

/** 3x3 node matrix icon — connectivity grows left to right (like reference). */
function NodeMatrix({ mode }: { mode: 0 | 1 | 2 }) {
  const pts: Array<[number, number]> = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pts.push([20 + c * 46, 20 + r * 46]);
  const edges: Array<[number, number]> =
    mode === 0
      ? []
      : mode === 1
        ? [[0, 1], [1, 2], [2, 5], [5, 8], [8, 7], [7, 6], [6, 3]]
        : [[0, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 7], [4, 8], [5, 8], [6, 7], [7, 8]];
  return (
    <svg viewBox="0 0 132 132" className="h-28 w-28" aria-hidden>
      {edges.map(([a, b], i) => {
        const p = pts[a] ?? [20, 20];
        const q = pts[b] ?? [20, 20];
        return (
          <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#0B0B0C" strokeWidth="1" opacity="0.3" />
        );
      })}
      {pts.map(([x, y], i) => (
        <rect key={i} x={x - 4} y={y - 4} width="8" height="8" fill="#0B0B0C" />
      ))}
    </svg>
  );
}

/* ================================ content ================================= */

const problems = [
  {
    mode: 0 as const,
    title: "Side projects stuck on localhost",
    body: "Your demo works on your machine — but hosting it means servers, bills, and DevOps you never signed up for.",
  },
  {
    mode: 1 as const,
    title: "Cron jobs need always-on boxes",
    body: "Nightly reports and reminders force you to rent a 24/7 server that idles 23 hours a day.",
  },
  {
    mode: 2 as const,
    title: "Growth is bottlenecked by ops",
    body: "Every new feature means more infra. Small teams spend forty percent of their time feeding servers.",
  },
];

type AppTab = {
  id: string;
  label: string;
  title: string;
  accentTitle: string;
  body: string;
  chips: string[];
  checks: string[];
  foot: string;
};

const appTabs: AppTab[] = [
  {
    id: "apis",
    label: "Instant APIs",
    title: "Launch your backend.",
    accentTitle: "No servers attached.",
    body: "Ship signup, checkout, and feed endpoints for your MVP or side project. Write TypeScript — spare PCs do the serving.",
    chips: ["Signup API", "Checkout", "Contact forms"],
    checks: ["Trigger", "Validate", "Respond", "Logged"],
    foot: "12.4K invokes today · median 41ms",
  },
  {
    id: "jobs",
    label: "Cron & Jobs",
    title: "Nightly work, handled.",
    accentTitle: "While you sleep.",
    body: "Reports, reminders, cleanups, and digests. Schedule once — the network finds a machine that's already awake.",
    chips: ["Nightly reports", "Reminders", "Cleanups"],
    checks: ["Scheduled 02:00", "Ran on node-38", "Emailed", "Archived"],
    foot: "860 jobs ran last night",
  },
  {
    id: "ai",
    label: "AI Features",
    title: "AI features without",
    accentTitle: "the GPU bill.",
    body: "Moderation, summaries, and smart replies split across volunteer machines instead of one pricey GPU box.",
    chips: ["Moderation", "Summaries", "Smart replies"],
    checks: ["24 flagged", "22 summarized", "8 escalated", "Synced"],
    foot: "3.1K AI runs this week",
  },
  {
    id: "iot",
    label: "Alerts & IoT",
    title: "Every ping answered.",
    accentTitle: "In milliseconds.",
    body: "Sensor data, lab rigs, campus devices, and uptime monitors ingested and routed the moment they fire.",
    chips: ["Sensors", "Lab rigs", "Uptime pings"],
    checks: ["Received", "Matched", "Alerted", "Stored"],
    foot: "99.2% delivered < 1s",
  },
];

const useCases = [
  { icon: Globe, title: "Instant APIs & backends", body: "Endpoints for MVPs, portfolios, and weekend launches — live in minutes, free while you grow.", foot: "SIGNUP → CHECKOUT → FEED" },
  { icon: PlugZap, title: "Webhooks & integrations", body: "Stripe, GitHub, and Discord events received and fanned out to the rest of your stack.", foot: "STRIPE · GITHUB · DISCORD" },
  { icon: CalendarClock, title: "Cron & background jobs", body: "Digests, invoices, and reminders that run nightly on whatever machine is already on.", foot: "EVERY NIGHT · 02:00 UTC" },
  { icon: ScanFace, title: "AI features on a budget", body: "Moderation, embeddings, and summaries shared across the crowd instead of one GPU.", foot: "MODERATE → SUMMARIZE → REPLY" },
  { icon: ImageIcon, title: "Media on demand", body: "Thumbnails, avatars, OG images, and receipts generated close to whoever asked.", foot: "UPLOAD → RESIZE → SERVE" },
  { icon: BellRing, title: "Realtime alerts & IoT", body: "Lab sensors, club dashboards, and status pages ingested the second they fire.", foot: "SENSORS · LABS · MONITORS" },
];

const floatTiles = [
  { icon: Globe, pos: "left-[7%] top-[14%]", r: "-12deg", d: "0s", show: "hidden md:flex" },
  { icon: FileText, pos: "left-[4%] top-[46%]", r: "8deg", d: "1.2s", show: "hidden md:flex" },
  { icon: Sparkles, pos: "left-[17%] top-[30%]", r: "10deg", d: "2.1s", show: "hidden lg:flex" },
  { icon: Cloud, pos: "right-[7%] top-[16%]", r: "12deg", d: "0.6s", show: "hidden md:flex" },
  { icon: ShieldCheck, pos: "right-[12%] top-[42%]", r: "-8deg", d: "1.7s", show: "hidden md:flex" },
  { icon: Zap, pos: "right-[5%] top-[62%]", r: "-14deg", d: "2.6s", show: "hidden lg:flex" },
];

const tickerItems = [
  { icon: Zap, text: "No servers to manage" },
  { icon: ShieldCheck, text: "Runs on volunteer PCs you trust" },
  { icon: FileCode2, text: "TypeScript first, no lock-in" },
  { icon: Globe, text: "APIs · Cron · AI · IoT in one fleet" },
  { icon: Download, text: "Free Windows agent" },
];

/* ================================== view ================================== */

export function LandingView() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(appTabs[0]?.id ?? "apis");
  const tab = appTabs.find((t) => t.id === activeTab) ?? appTabs[0]!;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 antialiased">
      <MotionStyles />
      {/* ------------------------------- header ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 w-full max-w-[1200px] items-center gap-4 border-x border-neutral-200 bg-white px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <HypercoreMark />
            <span className="font-mono text-sm font-bold tracking-[0.28em] uppercase">Hypercore</span>
            <span className="hidden font-mono text-sm text-neutral-400 sm:inline">/</span>
          </Link>
          <nav className="ml-2 hidden items-center gap-7 font-jetbrains-mono text-xs tracking-[0.18em] text-neutral-500 uppercase lg:flex">
            <a href="#applications" className="transition-colors hover:text-neutral-900">Applications</a>
            <a href="#problem" className="transition-colors hover:text-neutral-900">Why it matters</a>
            <a href="#usecases" className="transition-colors hover:text-neutral-900">Use cases</a>
            <a href="#join" className="transition-colors hover:text-neutral-900">Join</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <GridButton href="/download" size="sm" className="hidden sm:inline-flex">
              Get the agent <ArrowRight className="h-3.5 w-3.5" />
            </GridButton>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
          <EdgeMarks at={["0%", "100%"]} className="hidden lg:block" />
          <EdgeMarks at={["0%", "50%", "100%"]} className="lg:hidden" />
        </div>
        {menuOpen && (
          <div className="border-t border-neutral-200 bg-white lg:hidden">
            <nav className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 border-x border-neutral-200 bg-white px-4 py-3 font-mono text-sm tracking-[0.14em] uppercase">
              {[
                ["#applications", "Applications"],
                ["#problem", "Why it matters"],
                ["#usecases", "Use cases"],
                ["#join", "Join"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-2 py-2.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {label}
                </a>
              ))}
              <div className="py-2" onClick={() => setMenuOpen(false)}>
                <GridButton href="/download" size="sm">
                  Get the agent <ArrowRight className="h-3.5 w-3.5" />
                </GridButton>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ------------------------------ framed ------------------------------ */}
      <main className="mx-auto w-full max-w-[1200px] border-x border-neutral-200 bg-white">
        {/* -------------------------------- hero ------------------------------- */}
        <section className="relative grid bg-white lg:grid-cols-2">
          {/* left */}
          <div className="flex flex-col justify-center border-b border-neutral-200 bg-white p-6 sm:p-10 lg:border-r lg:border-b-0 lg:p-12 lg:py-18">
            <SectionLabel>Now live — volunteer network</SectionLabel>
            <h1 className="mt-6 text-[42px] leading-[1.02] font-medium tracking-tight text-balance text-neutral-900 sm:text-6xl">
              Run apps on spare machines.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-neutral-500">
              Hypercore turns idle Windows PCs into your app fleet. Ship
              APIs, automations, and AI features in TypeScript — without
              renting a single server.
            </p>
            <div className="mt-7">
              <GridButton href="/download">
                Download agent <ArrowRight className="h-4 w-4" />
              </GridButton>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" size="sm" className="border-neutral-200 bg-white font-mono text-xs tracking-[0.12em] uppercase">
                <Link href="/create">
                  <FileCode2 /> Write a function
                </Link>
              </Button>
              <span className="font-mono text-[11px] tracking-widest text-neutral-400 uppercase">
                Windows 10+ · x64 · Free
              </span>
            </div>
          </div>
          {/* right */}
          <div className="relative overflow-hidden border-b border-neutral-200 bg-white">
            <Halftone className="absolute inset-0" />
            <div className="relative flex h-full min-h-[420px] items-center justify-center p-6 sm:p-10">
              <Card className="w-full max-w-md gap-0 overflow-hidden rounded-[4px] border-neutral-200 bg-white py-0 shadow-xl">
                <CardHeader className="border-b border-neutral-200 px-5 py-4">
                  <p className="font-mono text-xs tracking-[0.2em] text-neutral-500 uppercase">
                    Functions — running
                  </p>
                </CardHeader>
                <CardContent className="space-y-5 bg-white px-5 py-5">
                  {[
                    ["Trigger: new signup", true],
                    ["Send welcome email", true],
                    ["Score & route lead", true],
                    ["Sync to dashboard", false],
                    ["Archive weekly report", false],
                  ].map(([label, done]) => (
                    <div key={label as string} className="relative flex items-center gap-3 pl-1">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-transparent"
                        style={done ? { background: ACCENT } : { background: "#e4e4e7" }}
                      >
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                      <span className={`text-[15px] ${done ? "text-neutral-900" : "text-neutral-400"}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="border-t border-neutral-200 bg-white px-5 py-3.5">
                  <p className="flex items-center gap-2 text-[13px] text-neutral-500">
                    <span className="h-2 w-2" style={{ background: ACCENT }} />
                    Running 24/7. Your team ships while the crowd serves.
                  </p>
                </CardFooter>
              </Card>
            </div>
          </div>
          <EdgeMarks at={["0%", "100%"]} className="hidden lg:block" />
          <EdgeMarks at={["0%", "50%", "100%"]} className="lg:hidden" />
        </section>

        <Hatch />

        {/* ------------------------------- problem ------------------------------ */}
        <section id="problem" className="relative scroll-mt-20 border-b border-neutral-200 bg-white px-6 py-14 sm:px-10 sm:py-20 lg:px-12">
          <SectionLabel>The problem</SectionLabel>
          <h2 className="mt-6 max-w-4xl text-3xl leading-[1.12] font-medium tracking-tight text-balance text-neutral-900 sm:text-5xl">
            Servers sit idle while side projects die on hosting bills.
            Hypercore turns scattered PCs into apps that run without
            constant checking.
          </h2>
          <EdgeMarks at={["0%", "100%"]} />
        </section>

        <section className="relative grid border-b border-neutral-200 bg-white md:grid-cols-3">
          {problems.map((p, i) => (
            <div
              key={p.title}
              className={`flex min-h-[380px] flex-col bg-white p-6 sm:p-8 ${i > 0 ? "border-t border-neutral-200 md:border-t-0 md:border-l md:border-neutral-200" : ""}`}
            >
              <div className="flex min-h-40 flex-1 items-start text-neutral-900">
                <NodeMatrix mode={p.mode} />
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-neutral-900">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">{p.body}</p>
            </div>
          ))}
          <EdgeMarks at={["0%", "100%"]} className="md:hidden" />
          <EdgeMarks at={["0%", "33.3333%", "66.6667%", "100%"]} className="hidden md:block" />
        </section>

        <Hatch />

        {/* ----------------------------- applications ---------------------------- */}
        <section id="applications" className="relative grid scroll-mt-20 border-b border-neutral-200 bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* tab list */}
          <div className="border-b border-neutral-200 bg-white lg:border-r lg:border-b-0">
            <div className="flex gap-0 overflow-x-auto p-4 sm:p-6 lg:flex-col lg:gap-0 lg:p-8">
              {appTabs.map((t) => {
                const active = t.id === activeTab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`relative shrink-0 px-4 py-4 text-left font-mono text-xs tracking-[0.18em] whitespace-nowrap uppercase transition-colors lg:px-5 lg:py-5 ${active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-900"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="h-2 w-2 shrink-0" style={{ background: active ? ACCENT : "#d4d4d8" }} />
                      {t.label}
                    </span>
                    <span
                      className="absolute right-0 bottom-0 left-0 h-[2px] lg:h-px"
                      style={active ? { background: ACCENT } : { background: "#e4e4e7" }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="hidden px-8 pb-8 lg:block">
              <GridButton href="/download">
                Download agent <ArrowRight className="h-4 w-4" />
              </GridButton>
            </div>
          </div>
          {/* detail — text sits on solid white, art stays behind the card */}
          <div className="relative overflow-hidden bg-white">
            <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-2 lg:p-12">
              <div className="relative rounded-md bg-white">
                <h3 className="text-3xl font-medium tracking-tight text-balance text-neutral-900 sm:text-4xl">
                  {tab.title}
                  <br />
                  <span className="text-neutral-400">{tab.accentTitle}</span>
                </h3>
                <p className="mt-4 bg-white text-[15px] leading-relaxed text-neutral-600">{tab.body}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {tab.chips.map((c) => (
                    <Button key={c} variant="outline" size="sm" className="pointer-events-none border-neutral-200 bg-white font-normal text-neutral-700">
                      {c}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <FlowField />
                <Card className="relative gap-0 self-start rounded-[4px] border-neutral-200 bg-white py-0 shadow-lg">
                  <CardContent className="bg-white px-0 py-2">
                    {tab.checks.map((c, i) => (
                      <div key={c}>
                        <div className="flex items-center gap-3 px-5 py-3.5">
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full"
                            style={{ background: ACCENT }}
                          >
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </span>
                          <span className="text-[15px] text-neutral-900">{c}</span>
                          {i === tab.checks.length - 1 && (
                            <span className="ml-auto font-mono text-[11px] tracking-widest uppercase" style={{ color: ACCENT }}>
                              Live
                            </span>
                          )}
                        </div>
                        {i < tab.checks.length - 1 && <Separator className="bg-neutral-200" />}
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="border-t border-neutral-200 bg-white px-5 py-3">
                    <p className="font-mono text-[11px] tracking-[0.16em] text-neutral-500 uppercase">{tab.foot}</p>
                  </CardFooter>
                </Card>
              </div>
            </div>
            <div className="relative bg-white px-6 pb-6 sm:px-10 lg:hidden lg:px-12">
              <GridButton href="/download">
                Download agent <ArrowRight className="h-4 w-4" />
              </GridButton>
            </div>
          </div>
          <EdgeMarks at={["0%", "100%"]} className="lg:hidden" />
          <EdgeMarks at={["0%", "41.6667%", "100%"]} className="hidden lg:block" />
        </section>

        <Hatch />

        {/* ------------------------------- use cases ----------------------------- */}
        <section id="usecases" className="relative scroll-mt-20 border-b border-neutral-200 bg-white px-6 py-14 sm:px-10 sm:py-20 lg:px-12">
          <SectionLabel>Use cases</SectionLabel>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-xl text-3xl font-medium tracking-tight text-balance text-neutral-900 sm:text-5xl">
              What will you run on it?
            </h2>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-[4px] border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((u) => (
              <div key={u.title} className="flex min-h-[260px] flex-col bg-white p-6 transition-colors hover:bg-neutral-50 sm:p-7">
                <u.icon className="h-6 w-6" style={{ color: ACCENT }} strokeWidth={1.7} />
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-neutral-900">{u.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">{u.body}</p>
                <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-neutral-400 uppercase">{u.foot}</p>
              </div>
            ))}
          </div>
          <EdgeMarks at={["0%", "100%"]} />
        </section>

        {/* --------------------------------- join -------------------------------- */}
        <section id="join" className="relative scroll-mt-20 bg-white">
          <div className="px-4 py-12 sm:px-8 sm:py-16">
            <div
              className="relative overflow-hidden rounded-2xl px-6 pt-16 pb-28 text-center text-white sm:px-12 sm:pt-24 sm:pb-32"
              style={{ background: `linear-gradient(180deg, #3560ff 0%, ${BLUE} 45%, #1a3cd8 100%)` }}
            >
              {/* halftone dot texture */}
              <svg className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 500">
                <defs>
                  <pattern id="join-dots" width="14" height="14" patternUnits="userSpaceOnUse">
                    <circle cx="7" cy="7" r="1.6" fill="#fff" opacity="0.28" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#join-dots)" />
              </svg>
              {/* bottom glow */}
              <div className="absolute bottom-10 left-1/2 h-48 w-[640px] max-w-[90%] -translate-x-1/2 rounded-[100%] bg-amber-100/80 blur-3xl" aria-hidden />
              {/* floating dashed tiles */}
              {floatTiles.map((t) => (
                <span
                  key={t.pos}
                  aria-hidden
                  className={`absolute h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/60 bg-white/10 backdrop-blur-[2px] ${t.pos} ${t.show}`}
                  style={
                    {
                      "--r": t.r,
                      animation: "hc-floaty 7s ease-in-out infinite",
                      animationDelay: t.d,
                    } as React.CSSProperties
                  }
                >
                  <t.icon className="h-6 w-6 text-white" strokeWidth={1.6} />
                </span>
              ))}
              {/* copy */}
              <div className="relative">
                <h2 className="mx-auto max-w-2xl text-4xl font-medium tracking-tight text-balance sm:text-6xl">
                  Run anything on the crowd.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-base">
                  Join thousands of builders who ditched hosting bills and
                  deployed on spare PCs instead. Start running for free —
                  no credit card required.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/download"
                    className="inline-flex h-12 items-center rounded-full bg-white px-7 text-[15px] font-semibold text-neutral-900 transition-transform hover:scale-[1.02]"
                  >
                    Download the agent
                  </Link>
                  <Link
                    href="/create"
                    className="inline-flex h-12 items-center rounded-full border border-white/25 bg-white/15 px-7 text-[15px] font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
                  >
                    Write a function
                  </Link>
                </div>
              </div>
              {/* ticker */}
              <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/25 bg-white/5 py-3.5 backdrop-blur-sm">
                <div className="flex w-max items-center gap-10 pr-10" style={{ animation: "hc-marquee 30s linear infinite" }}>
                  {[...tickerItems, ...tickerItems].map((item, i) => (
                    <span key={i} className="flex items-center gap-2.5 text-sm whitespace-nowrap text-white/90">
                      <item.icon className="h-4 w-4 text-white/70" />
                      {item.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <EdgeMarks at={["0%", "100%"]} />
        </section>

        {/* -------------------------------- footer ------------------------------- */}
        <footer className="relative border-t border-neutral-200 bg-white">
          <div className="flex flex-col gap-4 px-6 py-7 sm:flex-row sm:items-center sm:px-10 lg:px-12">
            <span className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.28em] text-neutral-900 uppercase">
              <HypercoreMark className="h-5 w-5" /> Hypercore
            </span>
            <span className="text-xs text-neutral-500">Volunteer compute for everyday apps</span>
            <span className="flex gap-5 font-mono text-xs tracking-[0.14em] text-neutral-500 uppercase sm:ml-auto">
              <Link href="/download" className="transition-colors hover:text-neutral-900">Download</Link>
              <Link href="/create" className="transition-colors hover:text-neutral-900">Create</Link>
              <a href="https://github.com/HitishRaoP/hypercore" target="_blank" rel="noreferrer" className="transition-colors hover:text-neutral-900">GitHub</a>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
