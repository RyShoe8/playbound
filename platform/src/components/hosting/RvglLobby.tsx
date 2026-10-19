"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

const KEYS = ["Up", "Down", "Left", "Right", "Return", "Escape", "Tab"] as const;

export function RvglLobby({ base, running, canControl }: { base: string; running: boolean; canControl: boolean }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!running || document.visibilityState !== "visible") return;
    try {
      const response = await fetch(`${base}/rvgl-lobby`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || typeof result.image !== "string") throw new Error(result.error || "Lobby screen unavailable");
      setImage(result.image);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lobby screen unavailable"); }
  }, [base, running]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refresh]);
  async function send(input: { type: "key"; key: string } | { type: "click"; x: number; y: number }) {
    if (!canControl || !running || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${base}/rvgl-lobby`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Lobby control failed");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lobby control failed"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h2 className="font-semibold">Live Re-Volt lobby</h2>
    <p className="text-sm text-muted-foreground">Choose the track and race settings on the host screen, then start the race. The host can spectate without an idle car on the track.</p>
    {!running ? <p className="text-sm">Start this server to open its lobby.</p> : <>
      {image ? <Image alt="Live Re-Volt host screen" draggable={false} unoptimized width={640} height={480} src={`data:image/jpeg;base64,${image}`}
        className="aspect-[4/3] w-full max-w-2xl rounded-lg bg-black object-contain"
        style={{ cursor: canControl ? "pointer" : "default" }}
        onClick={(event) => {
          if (!canControl) return;
          const rect = event.currentTarget.getBoundingClientRect();
          void send({ type: "click", x: Math.min(639, Math.max(0, Math.floor((event.clientX - rect.left) * 640 / rect.width))),
            y: Math.min(479, Math.max(0, Math.floor((event.clientY - rect.top) * 480 / rect.height))) });
        }} /> : <div className="flex aspect-[4/3] w-full max-w-2xl items-center justify-center rounded-lg bg-black text-sm text-white">Waiting for the host screen…</div>}
      {canControl ? <div className="flex flex-wrap gap-2">{KEYS.map((key) => <button key={key} type="button" disabled={busy}
        className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
        onClick={() => void send({ type: "key", key })}>{key === "Return" ? "Select / Start Race" : key}</button>)}</div> : null}
    </>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
