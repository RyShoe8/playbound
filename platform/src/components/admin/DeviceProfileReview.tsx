"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Approve / reject buttons for one submitted flight-device profile. */
export function DeviceProfileReview({ vidPid, status }: { vidPid: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function set(next: "approved" | "rejected") {
    setError(null);
    const res = await fetch(`/api/admin/device-profiles/${encodeURIComponent(vidPid)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) return setError("Could not save");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "approved" && (
        <button type="button" disabled={pending} onClick={() => set("approved")} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          Approve
        </button>
      )}
      {status !== "rejected" && (
        <button type="button" disabled={pending} onClick={() => set("rejected")} className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50">
          Reject
        </button>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
