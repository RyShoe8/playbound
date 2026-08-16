"use client";

import { useState } from "react";
import { usePartyStore } from "@/stores/partyStore";
import { useFriendsStore } from "@/stores/friendsStore";
import {
  PARTY_NAME_MAX,
  PARTY_VISIBILITY_LABELS,
  type PartyVisibility,
} from "@/lib/playTogether/types";
import { telemetry } from "@/lib/telemetry";
import { followPartyVoice } from "@/components/friends/DiscordLinkPrompt";
import { isHostableGame } from "@/lib/gameHost/catalog";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

const VISIBILITY_OPTIONS: { value: Exclude<PartyVisibility, "event">; hint: string }[] = [
  { value: "public", hint: "Anyone signed in can join. Listed on Events." },
  { value: "friends", hint: "Only your friends can join." },
  { value: "password", hint: "Anyone with the password can join. Not listed publicly." },
  { value: "invite_only", hint: "People you invite can join." },
];

export function CreatePartyPanel({ gameSlug, onCreated }: { gameSlug?: string; onCreated?: () => void }) {
  const { createParty, inviteFriends } = usePartyStore();
  const { friends } = useFriendsStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<PartyVisibility>("friends");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [wantVoice, setWantVoice] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  async function handleCreate() {
    if (visibility === "password" && password.trim().length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const voiceWindow =
      wantVoice && typeof window !== "undefined"
        ? window.open("about:blank", "playbound-party-voice")
        : null;
    try {
      telemetry.track("party_create_clicked", { gameSlug: gameSlug || "", visibility, wantVoice });
      const party = await createParty({
        name: name.trim() || null,
        gameSlug: gameSlug || null,
        visibility,
        maxSize: 8,
        password: visibility === "password" ? password.trim() : null,
        wantVoice,
      });

      if (party) {
        if (selectedFriends.size > 0) {
          await inviteFriends(party.id, [...selectedFriends]);
        }
        followPartyVoice(party, voiceWindow);
        onCreated?.();
      } else {
        if (voiceWindow && !voiceWindow.closed) voiceWindow.close();
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
          {gameSlug && isHostableGame(gameSlug)
            ? "PlayBound will start a public server for this game so friends can join without port forwarding."
            : "Host a lobby, invite friends, then pick a game in the party window."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Party name <span className="font-normal normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PARTY_NAME_MAX}
          placeholder="Friday raid, OpenRA night…"
          className="h-10 w-full rounded-lg border border-border bg-secondary/50 px-3 text-sm shadow-sm backdrop-blur"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Who can join
        </label>
        <PremiumSelect
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PartyVisibility)}
        >
          {VISIBILITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {PARTY_VISIBILITY_LABELS[opt.value]}
            </option>
          ))}
        </PremiumSelect>
        <p className="text-xs text-muted-foreground">
          {VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.hint}
        </p>
      </div>

      {visibility === "password" ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Party password
          </label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            autoComplete="off"
          />
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Voice channel</span>
          <span className="block text-xs text-muted-foreground">
            Open a Discord voice room for this party
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          checked={wantVoice}
          onChange={(e) => setWantVoice(e.target.checked)}
        />
      </label>

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
                    className="accent-primary"
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
    </div>
  );
}
