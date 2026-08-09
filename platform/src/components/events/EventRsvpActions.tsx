"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { telemetry } from "@/lib/telemetry";

export function EventRsvpActions({
  eventId,
  gameSlug,
  initialStatus,
  disabled,
}: {
  eventId: string;
  gameSlug?: string | null;
  initialStatus: string | null;
  disabled?: boolean;
}) {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setRsvp(next: "going" | "maybe" | "not_going") {
    if (authStatus !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update RSVP");
        return;
      }
      setStatus(next);
      if (next === "going") {
        void telemetry.track("event_rsvp_going", { eventId, gameSlug: gameSlug || undefined });
      } else if (next === "maybe") {
        void telemetry.track("event_rsvp_maybe", { eventId, gameSlug: gameSlug || undefined });
      } else {
        void telemetry.track("event_rsvp_cancelled", { eventId, gameSlug: gameSlug || undefined });
      }
      router.refresh();
    } catch {
      setError("Could not update RSVP");
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <p className="text-sm text-muted-foreground">RSVPs are closed for this event.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void setRsvp("going")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            status === "going"
              ? "bg-play text-play-foreground"
              : "border border-border bg-secondary hover:bg-secondary/80"
          }`}
        >
          I&apos;m Going
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void setRsvp("maybe")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            status === "maybe"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-secondary hover:bg-secondary/80"
          }`}
        >
          Maybe
        </button>
        {status && status !== "not_going" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setRsvp("not_going")}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary/60"
          >
            Can&apos;t make it
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
