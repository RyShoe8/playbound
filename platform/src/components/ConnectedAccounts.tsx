"use client";

import { useEffect } from "react";
import { SectionHeader } from "@/components/ui/bits";
import { useDiscordStore } from "@/stores/discordStore";

export function ConnectedAccounts({
  googleConnected,
  discordConfigured,
}: {
  googleConnected: boolean;
  discordConfigured: boolean;
}) {
  const { discordLinked, discordProfile, loading, refresh, unlink } = useDiscordStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section>
      <SectionHeader title="Connected Accounts" />
      <div className="space-y-4">
        {/* Google Account */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <h3 className="text-sm font-bold">Google</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {googleConnected
                ? "Your PlayBound account is linked to Google."
                : "Not connected to Google."}
            </p>
          </div>
          {googleConnected && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              ✅ Connected
            </span>
          )}
        </div>

        {/* Discord Account */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <h3 className="text-sm font-bold">Discord</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Linking Discord allows you to easily find your friends.
            </p>
            {loading ? (
              <p className="mt-2 text-xs text-muted-foreground animate-pulse">Loading...</p>
            ) : discordLinked && discordProfile ? (
              <div className="mt-2 flex items-center gap-2">
                {discordProfile.avatar && (
                  <img
                    src={discordProfile.avatar}
                    alt={discordProfile.username}
                    className="size-6 rounded-full"
                  />
                )}
                <span className="text-sm font-semibold text-[#5865F2]">
                  {discordProfile.globalName ? `${discordProfile.globalName} (${discordProfile.username})` : discordProfile.username}
                </span>
                <span className="text-xs text-muted-foreground">
                  Linked {new Date(discordProfile.linkedAt).toLocaleDateString()}
                </span>
              </div>
            ) : (
              !discordConfigured && (
                <p className="mt-2 text-xs text-destructive">
                  Discord linking is not configured on this deployment.
                </p>
              )
            )}
          </div>
          <div>
            {loading ? null : discordLinked ? (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 rounded-full bg-[#5865F2]/10 px-3 py-1 text-xs font-bold text-[#5865F2]">
                  🟢 Connected
                </span>
                <button
                  type="button"
                  onClick={() => unlink()}
                  className="rounded-full border border-border bg-secondary px-4 py-2 text-xs font-bold hover:bg-secondary/70 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            ) : discordConfigured ? (
              <a
                href="/api/auth/discord/start"
                className="inline-flex rounded-full bg-[#5865F2] px-4 py-2 text-xs font-bold text-white hover:brightness-110"
              >
                Connect Discord
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
