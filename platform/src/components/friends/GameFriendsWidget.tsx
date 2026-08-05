"use client";

import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { Avatar } from "@/components/ui/bits";

export function GameFriendsWidget({ gameSlug }: { gameSlug: string }) {
  const { status } = useSession();
  const { friends } = useFriendsStore();

  if (status !== "authenticated") return null;

  const friendsPlaying = friends.filter((f) => f.presence.currentGameId === gameSlug && f.presence.status === "playing");
  const friendsViewing = friends.filter((f) => f.presence.currentGameId === gameSlug && ["online", "browsing", "away"].includes(f.presence.status));

  if (friendsPlaying.length === 0 && friendsViewing.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-bold">Friends</h3>
      
      {friendsPlaying.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Playing Now</p>
          <div className="flex flex-col gap-2">
            {friendsPlaying.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <Avatar name={f.username} hue={265} size="sm" />
                <span className="text-sm font-semibold truncate">{f.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {friendsViewing.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">Viewing</p>
          <div className="flex flex-col gap-2">
            {friendsViewing.map((f) => (
              <div key={f.id} className="flex items-center gap-2 opacity-80">
                <Avatar name={f.username} hue={265} size="sm" />
                <span className="text-sm font-semibold truncate">{f.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
