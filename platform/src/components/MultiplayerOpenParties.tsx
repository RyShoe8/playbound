"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Crown, Gamepad2, Sparkles, Plus } from "lucide-react";
import type { PublicPartyPayload } from "@/lib/playTogether/party";
import { partyDisplayName } from "@/lib/playTogether/types";
import { usePartyStore } from "@/stores/partyStore";

type Props = {
  signedIn: boolean;
  onStartParty?: () => void;
  initialParties?: PublicPartyPayload[];
};

export function MultiplayerOpenParties({ signedIn, onStartParty, initialParties }: Props) {
  const [parties, setParties] = useState<PublicPartyPayload[]>(initialParties || []);
  const [loading, setLoading] = useState(!initialParties);
  const { joinParty, activeParty } = usePartyStore();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadOpenParties() {
      try {
        const res = await fetch("/api/parties/open");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && Array.isArray(data.parties)) {
          setParties(data.parties);
        }
      } catch (err) {
        console.error("Failed to load open parties:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadOpenParties();
    const interval = setInterval(loadOpenParties, 15_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border/50 bg-secondary/10 p-5">
        <div className="h-4 w-32 rounded bg-secondary/60" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-32 rounded-xl bg-secondary/40" />
          <div className="h-32 rounded-xl bg-secondary/40" />
        </div>
      </div>
    );
  }

  if (parties.length === 0) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-dashed border-border/70 bg-secondary/10 p-5">
        <div>
          <h3 className="text-sm font-bold text-foreground">No Open Parties Active</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Be the first to open a party! Open parties appear here for any signed-in player to discover and join.
          </p>
        </div>
        {signedIn && onStartParty && (
          <button
            type="button"
            onClick={onStartParty}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 flex-shrink-0"
          >
            <Plus className="size-3.5" />
            Create Open Party
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Open PlayBound Parties ({parties.length})
        </h2>
        {signedIn && onStartParty && (
          <button
            type="button"
            onClick={onStartParty}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="size-3.5" />
            Start Party
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {parties.map((party) => {
          const isMember = activeParty?.id === party.id;
          const count = party.memberCount || 1;
          const isFull = count >= party.maxSize;

          return (
            <div
              key={party.id}
              className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card/60 p-4 transition-all duration-300 hover:border-primary/50 hover:bg-card/90 hover:shadow-lg hover:shadow-primary/5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary border border-primary/40">
                      Open Party
                    </span>
                    <h3 className="mt-1.5 font-bold text-foreground text-sm line-clamp-1">
                      {partyDisplayName(party)}
                    </h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Gamepad2 className="size-3 text-cyan-400" />
                      <span>{party.gameTitle || party.gameSlug}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-bold text-foreground border border-border/50">
                    <Users className="size-3 text-primary" />
                    <span>
                      {count} / {party.maxSize}
                    </span>
                  </div>
                </div>

                {/* Party Leader & Count */}
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground mr-1">Host:</span>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Crown className="size-3 text-amber-400" />
                    {party.leaderUsername}
                  </span>
                  {count > 1 && (
                    <span className="text-xs text-muted-foreground">
                      +{count - 1} other{count > 2 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Join action */}
              <div className="mt-4 pt-2 border-t border-border/40 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {party.status === "playing"
                    ? "In Game"
                    : party.status === "launching"
                    ? "Launching"
                    : "Waiting for Players"}
                </span>

                {isMember ? (
                  <Link
                    href={`/friends?party=${party.id}`}
                    className="rounded-xl bg-secondary px-3 py-1.5 text-xs font-bold text-foreground hover:bg-secondary/80"
                  >
                    Your Party
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={isFull || joiningId === party.id || !signedIn}
                    onClick={async () => {
                      if (!signedIn) return;
                      setJoiningId(party.id);
                      try {
                        await joinParty(party.id);
                      } finally {
                        setJoiningId(null);
                      }
                    }}
                    className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                  >
                    {!signedIn
                      ? "Sign in to Join"
                      : isFull
                      ? "Party Full"
                      : joiningId === party.id
                      ? "Joining…"
                      : "Join Party"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
