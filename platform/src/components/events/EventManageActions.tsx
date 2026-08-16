"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Ban } from "lucide-react";

export function EventManageActions({
  eventId,
  isCancelled,
}: {
  eventId: string;
  isCancelled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this event?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to completely delete this event? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/events");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isCancelled ? (
        <button
          type="button"
          disabled={busy}
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20"
        >
          <Ban className="size-3.5" /> Cancel Event
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/20"
      >
        <Trash2 className="size-3.5" /> Delete Event
      </button>
    </div>
  );
}
