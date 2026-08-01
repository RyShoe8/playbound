"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUG_REPORT_STATUSES, BUG_REPORT_STATUS_LABELS, type BugReportStatus } from "@/lib/bugReports";

type Item = {
  _id: string;
  status: BugReportStatus;
  adminNotes?: string | null;
};

export function BugReportActions({ item }: { item: Item }) {
  const router = useRouter();
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function update(status: BugReportStatus) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/bug-reports/${item._id}`, {
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
      router.refresh();
      setBusy(false);
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
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
      <div className="flex flex-wrap gap-2">
        {BUG_REPORT_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy || item.status === status}
            onClick={() => void update(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
              item.status === status
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-secondary"
            }`}
          >
            {BUG_REPORT_STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </div>
  );
}
