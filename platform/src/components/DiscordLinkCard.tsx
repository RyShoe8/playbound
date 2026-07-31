"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiscordLinkCard({
  linked,
}: {
  linked: { username: string; avatarUrl?: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const configured = Boolean(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID);

  async function unlink() {
    setBusy(true);
    await fetch("/api/auth/discord/unlink", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold">Discord</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Optional. Linking Discord does not change how you sign in to PlayBound.
      </p>
      {linked ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold">{linked.username}</p>
          <button
            type="button"
            disabled={busy}
            onClick={unlink}
            className="rounded-full border border-border px-3 py-1 text-xs font-bold"
          >
            Unlink
          </button>
        </div>
      ) : configured ? (
        // Not next/link: this is a route handler that 302s to Discord's OAuth
        // screen, so it needs a real document navigation, not a client push.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/api/auth/discord/start"
          className="mt-3 inline-flex rounded-full bg-[#5865F2] px-4 py-2 text-xs font-bold text-white"
        >
          Link Discord account
        </a>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Discord linking is not configured on this deployment.</p>
      )}
    </section>
  );
}
