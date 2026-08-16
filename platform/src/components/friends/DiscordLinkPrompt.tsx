"use client";

export function DiscordLinkPrompt({
  open,
  inviteUrl,
  onClose,
  fromLauncher = false,
}: {
  open: boolean;
  inviteUrl?: string | null;
  onClose: () => void;
  fromLauncher?: boolean;
}) {
  if (!open) return null;
  const linkHref = fromLauncher
    ? "/api/auth/discord/start?from=launcher"
    : "/api/auth/discord/start";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h3 className="text-lg font-extrabold">Link Discord for party voice</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          PlayBound parties use a voice channel on our Discord. Link your account so we can
          drop you in with your friends.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={linkHref}
            className="inline-flex rounded-full bg-[#5865F2] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
          >
            Link Discord
          </a>
          {inviteUrl ? (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/80"
            >
              Open voice invite
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-semibold"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function followPartyVoice(
  result: {
    needsDiscordLink?: boolean;
    inviteUrl?: string | null;
    discord?: { inviteUrl?: string | null };
  } | null,
  targetWindow?: Window | null
): { needsDiscordLink: boolean; inviteUrl: string | null } {
  const inviteUrl = result?.inviteUrl || result?.discord?.inviteUrl || null;
  if (inviteUrl) {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = inviteUrl;
    } else if (typeof window !== "undefined") {
      window.open(inviteUrl, "_blank", "noopener,noreferrer");
    }
  } else if (targetWindow && !targetWindow.closed) {
    targetWindow.close();
  }
  return { needsDiscordLink: Boolean(result?.needsDiscordLink), inviteUrl };
}
