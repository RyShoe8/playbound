"use client";

import { useEffect, useRef } from "react";

/** Horizontally scroll the active tab into view on mount (mobile). */
export function ScrollActiveTab({ activeKey }: { activeKey: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current?.parentElement;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-tab="${activeKey}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeKey]);

  return <div ref={ref} className="hidden" aria-hidden />;
}
