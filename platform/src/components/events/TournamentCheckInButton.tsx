"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function TournamentCheckInButton({ eventId }: { eventId: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (status !== "authenticated") return null;

  async function checkIn() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/events/${eventId}/tournament`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "check_in" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Check-in failed");
        return;
      }
      setMsg("Checked in!");
      router.refresh();
    } catch {
      setMsg("Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void checkIn()}
        className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/80 disabled:opacity-60"
      >
        {busy ? "Checking in…" : "Tournament check-in"}
      </button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
