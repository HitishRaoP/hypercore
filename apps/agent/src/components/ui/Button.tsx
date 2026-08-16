import type { ButtonHTMLAttributes, ReactNode } from "react";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; loading?: boolean };
export function Button({ children, className = "", loading, disabled, ...props }: Props) {
  return <button disabled={disabled || loading} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>{loading && <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-950" />}{children}</button>;
}
