import Link from "next/link";
import { Users, Crown } from "lucide-react";
import { partyDisplayName, type PartyPayload } from "@/lib/playTogether/types";
import type { PublicPartyPayload } from "@/lib/playTogether/party";

type PartyCardParty = PublicPartyPayload | PartyPayload;

function rosterCount(party: PartyCardParty): number {
  if ("memberCount" in party && typeof party.memberCount === "number") {
    return party.memberCount;
  }
  return "members" in party ? party.members.length : 0;
}

export function PartyCard({ party }: { party: PartyCardParty }) {
  const isPlaying = party.status === "playing" || party.status === "launching";
  const members = "members" in party ? party.members : [];
  const count = rosterCount(party);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-bold">{partyDisplayName(party)}</h4>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Crown className="size-3.5" />
            {party.gameTitle || party.gameSlug || party.leaderUsername}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
          <Users className="size-3" />
          <span>
            {count} / {party.maxSize}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between">
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((m) => (
            <div
              key={m.userId}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-bold"
              title={m.username}
            >
              {m.username.charAt(0).toUpperCase()}
            </div>
          ))}
          {members.length > 5 && (
            <div className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold">
              +{members.length - 5}
            </div>
          )}
        </div>

        <Link
          href={`/friends?party=${party.id}`}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        >
          {isPlaying ? "View Party" : "Join Party"}
        </Link>
      </div>
    </div>
  );
}
