"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  _id: string;
  title: string;
  website: string;
  githubRepo?: string | null;
  description: string;
  license?: string | null;
  contactEmail: string;
  submitterName?: string | null;
  status: "pending" | "approved" | "rejected";
  adminNotes?: string | null;
  createdAt: string;
};

export function SubmissionActions({ item }: { item: Item }) {
  const router = useRouter();
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(status: "approved" | "rejected") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/game-submissions/${item._id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, adminNotes: notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed");
        setBusy(false);
        return;
      }
      if (status === "approved") {
        router.push(`/admin/games/new?fromSubmission=${item._id}`);
        router.refresh();
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  if (item.status !== "pending") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {item.status}
          {item.adminNotes ? ` — ${item.adminNotes}` : ""}
        </p>
        {item.status === "approved" && (
          <button
            type="button"
            onClick={() => router.push(`/admin/games/new?fromSubmission=${item._id}`)}
            className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-bold"
          >
            Open create draft
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Admin notes (optional)"
        className="h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-xs outline-none focus:border-ring"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("approved")}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          Approve & create draft
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("rejected")}
          className="rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-bold disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Approve opens the game editor prefilled from this submission. Publish from Admin → Games when ready.
      </p>
    </div>
  );
}
