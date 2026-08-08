"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useFriendsStore } from "@/stores/friendsStore";
import { telemetry } from "@/lib/telemetry";

type Status =
  | "none"
  | "outgoing_request"
  | "incoming_request"
  | "friends"
  | "blocked"
  | "loading"
  | "self";

export function ProfileFriendshipActions({
  userId,
  username,
  friendshipId: initialFriendshipId,
  initialStatus,
  isBlocker: initialIsBlocker,
  discordLinked,
  viewerHasDiscord,
}: {
  userId: string;
  username: string;
  friendshipId: string | null;
  initialStatus: Exclude<Status, "loading" | "self"> | "none";
  isBlocker: boolean;
  discordLinked: boolean;
  viewerHasDiscord: boolean;
}) {
  const { status: sessionStatus } = useSession();
  const { sendRequest, acceptRequest, declineRequest, cancelRequest, removeFriend, blockUser, unblockUser } =
    useFriendsStore();
  const [status, setStatus] = useState<Status>(
    sessionStatus === "authenticated" ? initialStatus : sessionStatus === "loading" ? "loading" : "none"
  );
  const [friendshipId, setFriendshipId] = useState<string | null>(initialFriendshipId);
  const [isBlocker, setIsBlocker] = useState(initialIsBlocker);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/friends/status?userId=${encodeURIComponent(userId)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setStatus(data.status || "none");
        setFriendshipId(data.friendshipId || null);
        setIsBlocker(Boolean(data.isBlocker));
      } catch {
        /* keep SSR status */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userId]);

  if (sessionStatus === "unauthenticated") {
    return (
      <Link
        href={`/login?callbackUrl=/users/${encodeURIComponent(username)}`}
        className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
      >
        Sign in to add friend
      </Link>
    );
  }

  if (status === "loading" || sessionStatus === "loading") {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      const res = await fetch(`/api/friends/status?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status || "none");
        setFriendshipId(data.friendshipId || null);
        setIsBlocker(Boolean(data.isBlocker));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "none" && (
        <button
          type="button"
          disabled={busy}
          className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          onClick={() => run(() => sendRequest(userId))}
        >
          Add Friend
        </button>
      )}
      {status === "outgoing_request" && (
        <>
          <span className="text-sm font-semibold text-muted-foreground">Request Sent</span>
          {friendshipId ? (
            <button
              type="button"
              disabled={busy}
              className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-bold disabled:opacity-60"
              onClick={() => run(() => cancelRequest(friendshipId))}
            >
              Cancel
            </button>
          ) : null}
        </>
      )}
      {status === "incoming_request" && friendshipId && (
        <>
          <button
            type="button"
            disabled={busy}
            className="h-10 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            onClick={() => run(() => acceptRequest(friendshipId))}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-bold disabled:opacity-60"
            onClick={() => run(() => declineRequest(friendshipId))}
          >
            Decline
          </button>
        </>
      )}
      {status === "friends" && (
        <>
          <span className="text-sm font-bold text-primary">Friends</span>
          <button
            type="button"
            disabled={busy}
            className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-bold disabled:opacity-60"
            onClick={() => run(() => removeFriend(userId))}
          >
            Remove
          </button>
        </>
      )}
      {status === "blocked" && (
        <>
          <span className="text-sm font-semibold text-muted-foreground">Blocked</span>
          {isBlocker ? (
            <button
              type="button"
              disabled={busy}
              className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-bold disabled:opacity-60"
              onClick={() => run(() => unblockUser(userId))}
            >
              Unblock
            </button>
          ) : null}
        </>
      )}
      {status !== "blocked" && (
        <button
          type="button"
          disabled={busy}
          className="h-10 rounded-full border border-border px-4 text-sm font-bold text-muted-foreground disabled:opacity-60"
          onClick={() => {
            if (confirm(`Block ${username}?`)) run(() => blockUser(userId));
          }}
        >
          Block
        </button>
      )}
      {discordLinked ? (
        <a
          href="https://discord.com/app"
          target="_blank"
          rel="noreferrer"
          className="h-10 inline-flex items-center rounded-full border border-border bg-secondary px-4 text-sm font-bold"
          onClick={() => telemetry.track("friend_discord_clicked", { source: "profile" })}
        >
          Open Discord
        </a>
      ) : viewerHasDiscord ? null : (
        <Link
          href="/profile"
          className="h-10 inline-flex items-center rounded-full border border-border px-4 text-sm font-bold text-muted-foreground"
        >
          Connect Discord
        </Link>
      )}
    </div>
  );
}
