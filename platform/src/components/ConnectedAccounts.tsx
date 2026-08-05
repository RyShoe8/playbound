"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SectionHeader } from "@/components/ui/bits";

export function ConnectedAccounts({
  googleConnected,
  discordLinked,
}: {
  googleConnected: boolean;
  discordLinked: { username: string; avatarUrl?: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const discordConfigured = Boolean(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID);

  async function unlinkDiscord() {
    setBusy(true);
    await fetch("/api/auth/discord/unlink", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

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
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              Connected
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
            {discordLinked && (
              <div className="mt-2 flex items-center gap-2">
                {discordLinked.avatarUrl && (
                  <img
                    src={discordLinked.avatarUrl}
                    alt={discordLinked.username}
                    className="size-6 rounded-full"
                  />
                )}
                <span className="text-sm font-semibold">{discordLinked.username}</span>
              </div>
            )}
            {!discordLinked && !discordConfigured && (
              <p className="mt-2 text-xs text-destructive">
                Discord linking is not configured on this deployment.
              </p>
            )}
          </div>
          <div>
            {discordLinked ? (
              <button
                type="button"
                disabled={busy}
                onClick={unlinkDiscord}
                className="rounded-full border border-border bg-secondary px-4 py-2 text-xs font-bold hover:bg-secondary/70 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : discordConfigured ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a
                href="/api/auth/discord/start"
                className="inline-flex rounded-full bg-[#5865F2] px-4 py-2 text-xs font-bold text-white hover:brightness-110"
              >
                Connect
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
