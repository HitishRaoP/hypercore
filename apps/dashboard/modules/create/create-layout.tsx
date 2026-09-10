"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const TOP_OFFSET = 160;
const BOTTOM_GAP = 0;

const CORNER_POSITIONS = [
  "top-[-4px] left-[calc((100%-700px)/2-4px)]",
  "top-[-4px] right-[calc((100%-700px)/2-4px)]",
  "bottom-[-4px] left-[calc((100%-700px)/2-4px)]",
  "bottom-[-4px] right-[calc((100%-700px)/2-4px)]",
];

export const CreateLayout = ({ children }: { children: ReactNode }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContentHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen bg-muted-primary/10">
      <div className="pointer-events-none absolute inset-y-0 left-[calc((100%-700px)/2)] border-l border-dashed border-muted-primary" />
      <div className="pointer-events-none absolute inset-y-0 right-[calc((100%-700px)/2)] border-l border-dashed border-muted-primary" />

      <div
        className="pointer-events-none absolute inset-x-0 border-y border-dashed border-muted-primary transition-[height] duration-300 ease-out"
        style={{ top: TOP_OFFSET, height: contentHeight + BOTTOM_GAP }}
      >
        {CORNER_POSITIONS.map((position) => (
          <span
            key={position}
            className={`absolute ${position} h-1.5 w-1.5 border border-muted-primary bg-background`}
          />
        ))}
      </div>

      <div style={{ paddingTop: TOP_OFFSET }}>
        <div
          ref={contentRef}
          className="mx-auto grid max-w-[1860px] grid-cols-[1fr_700px_1fr]"
        >
          <div />
          <div className="p-8">{children}</div>
          <div />
        </div>
      </div>
    </div>
  );
};
