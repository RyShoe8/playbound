"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download } from "lucide-react";
import type { ConfigSyncResult } from "@/lib/playTogether/party";
import { telemetry } from "@/lib/telemetry";

export function PartyConfigSync({ partyId, gameSlug }: { partyId: string; gameSlug: string }) {
  const [sync, setSync] = useState<ConfigSyncResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/parties/${partyId}/sync`);
        if (res.ok) {
          const data = await res.json();
          setSync(data.sync);
        }
      } catch (err) {
        console.error("Failed to check config sync", err);
      } finally {
        setLoading(false);
      }
    }
    
    // Polling here could be added, but for now we check once when mounted.
    // Real-time would require webhooks/websockets from library changes,
    // which is out of scope for the initial implementation.
    void check();
    telemetry.track("party_config_sync_viewed", { partyId, gameSlug });
  }, [partyId, gameSlug]);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-card p-4" />;
  }

  if (!sync) return null;

  if (sync.allReady) {
    return (
      <div className="rounded-xl border border-border bg-green-500/10 p-4 text-green-700 dark:text-green-400 flex items-start gap-3">
        <CheckCircle2 className="size-5 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-bold text-sm">Everyone is ready to play</h4>
          <p className="text-xs mt-1 opacity-90">All members have the required game and editions installed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="bg-destructive/10 p-3 flex items-center gap-2 border-b border-border">
        <AlertCircle className="size-4 text-destructive" />
        <h4 className="font-bold text-sm text-destructive">Configuration Mismatch</h4>
      </div>
      
      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Some members are missing the required game files. They won&apos;t be able to launch with the party until they install them.
        </p>

        <ul className="space-y-3">
          {sync.members.map((m) => {
            const missing = [];
            if (!m.hasGame) missing.push("Base Game");
            else if (!m.hasEdition && sync.editionSlug) missing.push("Required Edition");
            
            if (missing.length === 0) return null;

            return (
              <li key={m.userId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-full bg-muted flex items-center justify-center font-bold text-[10px]">
                    {m.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold">{m.username}</span>
                  <span className="text-muted-foreground">needs {missing.join(", ")}</span>
                </div>
                
                {m.userId === "TODO_CURRENT_USER_ID" /* Would be good to highlight if it's the current user */ ? (
                  <Link 
                    href={`/games/${gameSlug}`}
                    className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-bold"
                  >
                    <Download className="size-3" /> Install
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
