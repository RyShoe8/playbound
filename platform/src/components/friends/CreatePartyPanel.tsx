"use client";

import { useState } from "react";
import { usePartyStore } from "@/stores/partyStore";
import { useFriendsStore } from "@/stores/friendsStore";
import type { PartyVisibility } from "@/lib/playTogether/types";
import { PARTY_VISIBILITIES } from "@/lib/playTogether/types";
import { telemetry } from "@/lib/telemetry";
import { DiscordLinkPrompt, followPartyVoice } from "@/components/friends/DiscordLinkPrompt";
import { isHostableGame } from "@/lib/gameHost/catalog";

export function CreatePartyPanel({ gameSlug, onCreated }: { gameSlug: string; onCreated?: () => void }) {
  const { createParty, inviteFriends } = usePartyStore();
  const { friends } = useFriendsStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [visibility, setVisibility] = useState<PartyVisibility>("friends");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [discordPrompt, setDiscordPrompt] = useState<{ open: boolean; inviteUrl: string | null }>({
    open: false,
    inviteUrl: null,
  });

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      telemetry.track("party_create_clicked", { gameSlug, visibility });
      const party = await createParty({
        gameSlug,
        visibility,
        maxSize: 8,
      });

      if (party) {
        if (selectedFriends.size > 0) {
          await inviteFriends(party.id, [...selectedFriends]);
        }
        const voice = followPartyVoice(party);
        if (voice.needsDiscordLink) {
          setDiscordPrompt({ open: true, inviteUrl: voice.inviteUrl });
        } else {
          onCreated?.();
        }
      } else {
        setError("Failed to create party. You might already have one active.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h4 className="font-bold">Create a Party</h4>
        <p className="text-sm text-muted-foreground">
          {isHostableGame(gameSlug)
            ? "PlayBound will start a public server for this game so friends can join without port forwarding."
            : "Host a lobby, coordinate mods, and launch together."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Visibility
        </label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PartyVisibility)}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          {PARTY_VISIBILITIES.filter((v) => v !== "event").map((v) => (
            <option key={v} value={v}>
              {v === "friends" ? "Friends Only (Discoverable)" : "Invite Only"}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Invite Friends (Optional)
        </label>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add friends to invite them.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {friends.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-secondary/60">
                  <input
                    type="checkbox"
                    checked={selectedFriends.has(f.id)}
                    onChange={() => {
                      const next = new Set(selectedFriends);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      setSelectedFriends(next);
                    }}
                  />
                  <span className="text-sm font-medium">{f.username}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleCreate()}
        className="w-full rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create Party"}
      </button>
      <DiscordLinkPrompt
        open={discordPrompt.open}
        inviteUrl={discordPrompt.inviteUrl}
        onClose={() => {
          setDiscordPrompt({ open: false, inviteUrl: null });
          onCreated?.();
        }}
      />
    </div>
  );
}
