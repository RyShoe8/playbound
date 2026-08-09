"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { telemetry } from "@/lib/telemetry";

export function InviteFriendsPanel({ gameSlug }: { gameSlug: string }) {
  const { status } = useSession();
  const { friends, fetchFriends } = useFriendsStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") void fetchFriends();
  }, [status, fetchFriends]);

  if (status !== "authenticated") return null;

  async function send() {
    if (selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      telemetry.track("invite_friends_clicked", { gameSlug, surface: "game_page" });
      const res = await fetch("/api/play-invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameSlug,
          recipientIds: [...selected],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.results) {
        setMessage(data.error || "Could not send invites");
        return;
      }
      const sent = (data.results || []).filter((r: { status?: number }) => r.status === 201).length;
      for (const id of selected) {
        telemetry.track("play_invite_sent", { recipientId: id, gameSlug });
      }
      setMessage(sent ? `Invite sent to ${sent} friend${sent === 1 ? "" : "s"}.` : "No new invites sent.");
      setSelected(new Set());
      setOpen(false);
    } catch {
      setMessage("Could not send invites");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/80"
        onClick={() => {
          setOpen((v) => !v);
          telemetry.track("invite_friends_clicked", { gameSlug, surface: "game_page" });
        }}
      >
        Invite Friends
      </button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {open ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Select friends
          </p>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add friends to invite them.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {friends.map((f) => {
                const checked = selected.has(f.id);
                return (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(f.id)) next.delete(f.id);
                            else next.add(f.id);
                            return next;
                          });
                        }}
                      />
                      <span className="font-semibold">{f.username}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            disabled={busy || selected.size === 0}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            onClick={() => void send()}
          >
            {busy ? "Sending…" : "Invite"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
