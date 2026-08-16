import type { HTMLAttributes } from "react";
export function Badge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`} {...props} />; }
