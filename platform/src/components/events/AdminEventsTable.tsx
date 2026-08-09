"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedEvent } from "@/lib/events/serialize";

export function AdminEventsTable({
  events,
}: {
  events: (SerializedEvent & { rawStatus?: string })[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function generateBracket(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/events/${id}/tournament`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate_bracket" }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Event</th>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Going</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-border/70">
              <td className="px-3 py-2">
                <Link href={`/events/${e.id}`} className="font-semibold hover:underline">
                  {e.title}
                </Link>
                <p className="text-xs capitalize text-muted-foreground">
                  {String(e.eventType).replace(/_/g, " ")}
                  {e.featured ? " · featured" : ""}
                </p>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {e.when.dateLine}
                <br />
                {e.when.timeLine}
              </td>
              <td className="px-3 py-2 text-xs capitalize">{e.status}</td>
              <td className="px-3 py-2">{e.counts?.going ?? 0}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === e.id}
                    onClick={() => void patch(e.id, { featured: !e.featured })}
                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
                  >
                    {e.featured ? "Unfeature" : "Feature"}
                  </button>
                  {e.eventType === "tournament" ? (
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      onClick={() => void generateBracket(e.id)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
                    >
                      Generate bracket
                    </button>
                  ) : null}
                  {e.status !== "cancelled" ? (
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      onClick={() => void patch(e.id, { cancel: true })}
                      className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
