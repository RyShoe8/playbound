"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { telemetry } from "@/lib/telemetry";

/**
 * When landing on a game page from a play-invite notification (?playInvite=id),
 * accept the invite once and strip the query param.
 */
export function AcceptPlayInviteEffect({ gameSlug }: { gameSlug: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const done = useRef(false);

  useEffect(() => {
    const inviteId = searchParams.get("playInvite");
    if (!inviteId || done.current) return;
    done.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/play-invites/${encodeURIComponent(inviteId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        if (res.ok) {
          telemetry.track("play_invite_accepted", { inviteId, gameSlug });
        }
      } catch {
        /* ignore */
      } finally {
        const next = new URLSearchParams(searchParams.toString());
        next.delete("playInvite");
        const q = next.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }
    })();
  }, [searchParams, router, pathname, gameSlug]);

  return null;
}
