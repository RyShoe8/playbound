"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
};

export function UserActions({
  user,
  currentUserId,
}: {
  user: AdminUserRow;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSelf = user.id === currentUserId;

  async function patch(body: { role?: "user" | "admin"; disabled?: boolean }) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Update failed");
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

  async function remove() {
    if (!confirm(`Permanently delete ${user.username}? Their posts stay as “Deleted user” content.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Delete failed");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {user.role === "user" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ role: "admin" })}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
          >
            Make admin
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || isSelf}
            onClick={() => patch({ role: "user" })}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
          >
            Demote
          </button>
        )}
        {user.disabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ disabled: false })}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
          >
            Enable
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || isSelf}
            onClick={() => patch({ disabled: true })}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
          >
            Disable
          </button>
        )}
        <button
          type="button"
          disabled={busy || isSelf}
          onClick={remove}
          className="rounded-full border border-destructive/40 px-2.5 py-1 text-[11px] font-bold text-destructive disabled:opacity-60"
        >
          Delete
        </button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
