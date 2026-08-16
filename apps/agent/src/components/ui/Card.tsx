import type { HTMLAttributes } from "react";
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) { return <section className={`rounded-xl border border-zinc-800 bg-[#0a0a0a] ${className}`} {...props} />; }
