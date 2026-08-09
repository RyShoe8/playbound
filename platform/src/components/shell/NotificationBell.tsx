"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell } from "lucide-react";
import { useFriendsStore } from "@/stores/friendsStore";
import { LocalTime } from "@/components/LocalTime";

type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
  meta?: {
    inviteId?: string;
    gameSlug?: string;
    actions?: string[];
    fromUserId?: string;
  };
};

/**
 * In-app notification bell. Also starts friends-request polling so Incoming
 * badges update without visiting /friends.
 */
export function NotificationBell() {
  const { status } = useSession();
  const startPolling = useFriendsStore((s) => s.startPolling);
  const stopPolling = useFriendsStore((s) => s.stopPolling);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      stopPolling();
      return;
    }
    startPolling(30000);
    const kickoff = window.setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 45000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(t);
      stopPolling();
    };
  }, [status, startPolling, stopPolling, refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (status !== "authenticated") return null;

  async function markRead(id?: string, all?: boolean) {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { id }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(Number(data.unreadCount) || 0);
        if (all) {
          setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
        } else if (id) {
          setItems((prev) =>
            prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n))
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-bold">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => void markRead(undefined, true)}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className={!n.readAt ? "bg-primary/5" : undefined}>
                  <div className="px-3 py-2.5">
                    <Link
                      href={n.href || "/friends"}
                      className="block hover:opacity-90"
                      onClick={() => {
                        if (!n.readAt) void markRead(n.id);
                        setOpen(false);
                        void import("@/lib/telemetry").then(({ telemetry }) =>
                          telemetry.track("play_notification_clicked", {
                            type: n.type,
                            gameSlug: n.meta?.gameSlug,
                          })
                        );
                      }}
                    >
                      <p className="text-sm font-semibold">{n.title}</p>
                      {n.body ? <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p> : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <LocalTime value={n.createdAt} />
                      </p>
                    </Link>
                    {n.type === "play_invite" && n.meta?.inviteId ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground"
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                `/api/play-invites/${encodeURIComponent(n.meta!.inviteId!)}`,
                                {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ action: "accept" }),
                                }
                              );
                              if (res.ok) {
                                void import("@/lib/telemetry").then(({ telemetry }) =>
                                  telemetry.track("play_invite_accepted", {
                                    inviteId: n.meta?.inviteId,
                                    gameSlug: n.meta?.gameSlug,
                                  })
                                );
                              }
                              if (!n.readAt) void markRead(n.id);
                              setOpen(false);
                              window.location.href =
                                n.href ||
                                (n.meta?.gameSlug
                                  ? `/games/${encodeURIComponent(n.meta.gameSlug)}`
                                  : "/friends");
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-secondary px-2.5 py-1 text-[11px] font-bold"
                          onClick={async () => {
                            try {
                              await fetch(`/api/play-invites/${encodeURIComponent(n.meta!.inviteId!)}`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ action: "decline" }),
                              });
                              void import("@/lib/telemetry").then(({ telemetry }) =>
                                telemetry.track("play_invite_declined", {
                                  inviteId: n.meta?.inviteId,
                                  gameSlug: n.meta?.gameSlug,
                                })
                              );
                              if (!n.readAt) void markRead(n.id);
                              void refresh();
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    ) : n.meta?.actions?.includes("join") && n.meta?.gameSlug ? (
                      <div className="mt-2">
                        <Link
                          href={`/games/${encodeURIComponent(n.meta.gameSlug)}`}
                          className="rounded-md bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground"
                          onClick={() => {
                            if (!n.readAt) void markRead(n.id);
                            setOpen(false);
                          }}
                        >
                          Join
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-border px-3 py-2">
            <Link
              href="/friends"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Open Friends
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
