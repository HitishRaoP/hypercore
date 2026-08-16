import type { InputHTMLAttributes } from "react";
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={`h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-500 ${className}`} {...props} />; }
