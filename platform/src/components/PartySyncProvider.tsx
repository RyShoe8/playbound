"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePartyStore } from "@/stores/partyStore";
import { watchPartySyncFocus } from "@/lib/watchPartySync";

const GLOBAL_PARTY_POLL_MS = 5000;

/**
 * Keeps party state fresh while the user is in a live party, even off /friends,
 * and refreshes on tab focus / visibility.
 */
export function PartySyncProvider() {
  const { status } = useSession();
  const activeParty = usePartyStore((s) => s.activeParty);

  useEffect(() => {
    if (status !== "authenticated") return;
    return watchPartySyncFocus();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const inLiveParty = Boolean(activeParty && activeParty.status !== "ended");
    if (!inLiveParty) return;

    const { startPolling, stopPolling } = usePartyStore.getState();
    startPolling(GLOBAL_PARTY_POLL_MS);
    return () => stopPolling();
  }, [status, activeParty?.id, activeParty?.status]);

  return null;
}
