"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { usePartyStore } from "@/stores/partyStore";
import { Avatar } from "@/components/ui/bits";
import { InviteFriendsPanel } from "@/components/friends/InviteFriendsPanel";
import { AcceptPlayInviteEffect } from "@/components/friends/AcceptPlayInviteEffect";
import { telemetry } from "@/lib/telemetry";

export function GameFriendsWidget({ gameSlug }: { gameSlug: string }) {
  const { status } = useSession();
  const { friends, fetchFriends, startPolling, stopPolling } = useFriendsStore();
  const {
    activeParty,
    fetchParties,
    startPolling: startPartyPolling,
    stopPolling: stopPartyPolling,
  } = usePartyStore();

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchFriends();
    startPolling(45000);
    void fetchParties();
    startPartyPolling(15000);
    return () => {
      stopPolling();
      stopPartyPolling();
    };
  }, [
    status,
    fetchFriends,
    startPolling,
    stopPolling,
    fetchParties,
    startPartyPolling,
    stopPartyPolling,
  ]);

  if (status !== "authenticated") return null;

  const viewerPartyId = activeParty?.id ?? null;

  const friendsInParty = friends.filter(
    (f) => f.presence.currentPartyId && f.presence.currentGameId === gameSlug
  );
  
  const partyGroups = friendsInParty.reduce((acc, f) => {
    const pid = f.presence.currentPartyId!;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(f);
    return acc;
  }, {} as Record<string, typeof friends>);

  const friendsPlaying = friends.filter(
    (f) => f.presence.currentGameId === gameSlug && f.presence.status === "playing" && !f.presence.currentPartyId
  );
  const friendsViewing = friends.filter(
    (f) =>
      f.presence.currentGameId === gameSlug &&
      ["online", "browsing", "away", "viewing_game"].includes(f.presence.status)
  );
  const friendsLooking = friends.filter(
    (f) =>
      f.presence.lookingForPlayers &&
      (f.presence.lookingForPlayersGameId === gameSlug || f.presence.currentGameId === gameSlug)
  );

  const inviteEffect = (
    <Suspense fallback={null}>
      <AcceptPlayInviteEffect gameSlug={gameSlug} />
    </Suspense>
  );

  if (
    friendsPlaying.length === 0 &&
    friendsViewing.length === 0 &&
    friendsLooking.length === 0 &&
    friendsInParty.length === 0
  ) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
        {inviteEffect}
        <h3 className="text-sm font-bold">Your Friends</h3>
        <p className="text-sm text-muted-foreground">
          None of your friends are playing this right now.
        </p>
        <InviteFriendsPanel gameSlug={gameSlug} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
      {inviteEffect}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Your Friends</h3>
        <InviteFriendsPanel gameSlug={gameSlug} />
      </div>

      {Object.entries(partyGroups).map(([partyId, partyFriends]) => (
        <div key={partyId} className="mb-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-primary uppercase">
            In a Party
          </p>
          <div className="rounded-lg border border-border bg-secondary/20 p-3">
            <p className="text-sm font-medium mb-3">
              {partyFriends.map((f) => f.username).join(", ")}
            </p>
            {viewerPartyId === partyId ? (
              <span className="text-xs font-semibold text-muted-foreground">In your party</span>
            ) : (
              <Link
                href={`/friends?party=${partyId}`}
                className="inline-block rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110"
              >
                Join Party
              </Link>
            )}
          </div>
        </div>
      ))}

      {friendsPlaying.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Playing Now
          </p>
          <div className="flex flex-col gap-2">
            {friendsPlaying.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={f.username} hue={265} size="sm" />
                  <span className="truncate text-sm font-semibold">{f.username}</span>
                </div>
                {f.join?.href && f.join.capability !== "unsupported" ? (
                  <Link
                    href={f.join.href}
                    className="shrink-0 rounded-full bg-play px-2.5 py-1 text-[11px] font-bold text-play-foreground"
                    onClick={() =>
                      telemetry.track("join_game_clicked", {
                        friendId: f.id,
                        gameSlug,
                        capability: f.join?.capability,
                        surface: "game_page",
                      })
                    }
                  >
                    {f.join.label || "Join"}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {friendsLooking.length > 0 && (
        <div>
          <p className="mb-2 mt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Looking for Players
          </p>
          <div className="flex flex-col gap-2">
            {friendsLooking.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <Avatar name={f.username} hue={265} size="sm" />
                <span className="truncate text-sm font-semibold">{f.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {friendsViewing.length > 0 && (
        <div>
          <p className="mb-2 mt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Viewing
          </p>
          <div className="flex flex-col gap-2">
            {friendsViewing.map((f) => (
              <div key={f.id} className="flex items-center gap-2 opacity-80">
                <Avatar name={f.username} hue={265} size="sm" />
                <span className="truncate text-sm font-semibold">{f.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
