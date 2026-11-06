"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScheduledPartyAction({ eventId, roomId, organizer, gameSlug }: {
  eventId: string; roomId: string | null; organizer: boolean; gameSlug: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    setBusy(true); setError("");
    try {
      const response = await fetch(roomId ? `/api/parties/${roomId}/join` : "/api/parties", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roomId ? {} : { visibility: "event", eventId, gameSlug }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not open the party.");
      if (data.party.eventId !== eventId) throw Error("Leave your current party before starting this one.");
      router.push(`/party/${data.party.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Try again."); setBusy(false); }
  }
  if (!roomId && !organizer) return <p>The organizer can open the party when everyone is ready.</p>;
  return <div><button disabled={busy} className="new-button primary" onClick={enter}>{busy ? "Opening…" : roomId ? "Enter party" : "Open party lobby"}</button>{error && <p role="alert">{error}</p>}</div>;
}
