"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

/** Refresh only the LFG aggregate; this never refreshes game-server feeds. */
export function LookingToPartyCount({ initialCount }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/presence/lfg/count", { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return;
      const data = await response.json();
      if (mounted.current && Number.isInteger(data.count) && data.count >= 0) setCount(data.count);
    } catch { /* Keep the last good count during temporary failures. */ }
  }, []);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) void refresh(); });
    return () => { mounted.current = false; };
  }, [refresh]);
  useVisiblePolling(refresh, 30_000);
  return <>{count === undefined ? "—" : count.toLocaleString()}</>;
}
