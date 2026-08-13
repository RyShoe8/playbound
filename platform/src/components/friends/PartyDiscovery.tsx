"use client";

import { usePartyStore } from "@/stores/partyStore";
import { PartyCard } from "./PartyCard";
import { Sparkles } from "lucide-react";

export function PartyDiscovery() {
  const { discoverableParties, loading } = usePartyStore();

  if (loading && discoverableParties.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Sparkles className="size-4" />
          <h3>You Could Play Together</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  if (discoverableParties.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-primary font-bold">
        <Sparkles className="size-4" />
        <h3>You Could Play Together</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {discoverableParties.map((p) => (
          <PartyCard key={p.id} party={p} />
        ))}
      </div>
    </div>
  );
}
