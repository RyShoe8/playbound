"use client";

import { useSession } from "next-auth/react";
import { Users, Crown, Settings, LogOut, Check, X, Phone, Play } from "lucide-react";
import { usePartyStore } from "@/stores/partyStore";
import type { PartyPayload } from "@/lib/playTogether/types";
import { PARTY_VISIBILITIES } from "@/lib/playTogether/types";

export function PartyView({ party }: { party: PartyPayload }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { leaveParty, removeMember, transferLeadership, setVisibility, setReady, launchParty, endParty, provisionDiscord } = usePartyStore();

  if (!userId) return null;

  const isLeader = party.leaderId === userId;
  const me = party.members.find((m) => m.userId === userId);
  const isReady = me?.ready ?? false;
  const allReady = party.members.length >= 2 && party.members.every((m) => m.ready);
  const canLaunch = isLeader && allReady && party.status === "ready";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-muted p-4 flex items-center justify-between border-b border-border">
        <div>
          <h3 className="text-lg font-bold">{party.gameTitle || party.gameSlug} Party</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <span className="capitalize">{party.status.replace("_", " ")}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Users className="size-3" /> {party.members.length} / {party.maxSize}
            </span>
          </p>
        </div>
        
        {isLeader && party.status !== "ended" && (
          <div className="flex items-center gap-2">
            <select
              value={party.visibility}
              onChange={(e) => void setVisibility(party.id, e.target.value as any)}
              className="text-xs rounded-md border-border bg-background px-2 py-1"
            >
              {PARTY_VISIBILITIES.filter(v => v !== "event").map((v) => (
                <option key={v} value={v}>{v.replace("_", " ")}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="p-4 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members</h4>
        <ul className="space-y-1">
          {party.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between p-2 rounded-md hover:bg-secondary/40">
              <div className="flex items-center gap-3">
                <div className={`size-8 rounded-full flex items-center justify-center font-bold text-xs ${m.ready ? 'bg-green-500/20 text-green-600' : 'bg-muted'}`}>
                  {m.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    {m.username}
                    {m.role === "leader" && <Crown className="size-3.5 text-primary" />}
                    {m.userId === userId && <span className="text-xs text-muted-foreground font-normal">(You)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.ready ? "Ready" : "Not ready"}
                  </p>
                </div>
              </div>

              {isLeader && m.userId !== userId && (
                <div className="flex gap-2">
                  <button onClick={() => void transferLeadership(party.id, m.userId)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground" title="Make Leader">
                    <Crown className="size-4" />
                  </button>
                  <button onClick={() => void removeMember(party.id, m.userId)} className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive" title="Kick">
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="p-4 bg-muted/50 border-t border-border flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-3">
          {party.status !== "ended" && party.status !== "launching" && party.status !== "playing" && (
            <button
              onClick={() => void setReady(party.id, !isReady)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold text-sm transition-colors ${
                isReady 
                  ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isReady ? <X className="size-4" /> : <Check className="size-4" />}
              {isReady ? "Cancel Ready" : "Ready Up"}
            </button>
          )}

          {canLaunch && (
            <button
              onClick={() => void launchParty(party.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary font-bold text-primary-foreground text-sm hover:bg-primary/90 shadow-sm"
            >
              <Play className="size-4 fill-current" />
              Launch Game
            </button>
          )}

          {party.status === "playing" && (
            <div className="px-4 py-2 rounded-md bg-primary/20 text-primary font-bold text-sm flex items-center gap-2">
              <Play className="size-4 fill-current" /> Playing
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {party.discord.inviteUrl ? (
            <a 
              href={party.discord.inviteUrl} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 text-sm font-semibold transition-colors"
            >
              <Phone className="size-3.5" /> Voice
            </a>
          ) : isLeader && (
            <button
              onClick={() => void provisionDiscord(party.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-secondary text-sm font-medium transition-colors"
            >
              <Phone className="size-3.5" /> Enable Voice
            </button>
          )}

          <button
            onClick={() => {
              if (isLeader && party.members.length === 1) void endParty(party.id);
              else void leaveParty(party.id);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-destructive hover:bg-destructive/10 text-sm font-medium transition-colors"
          >
            <LogOut className="size-3.5" />
            {isLeader && party.members.length === 1 ? "End Party" : "Leave"}
          </button>
        </div>
      </div>
    </div>
  );
}
