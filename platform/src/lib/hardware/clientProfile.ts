"use client";

/**
 * The signed-in player's stored hardware profile, fetched once per page
 * session and shared by every component that needs it (the Discover hardware
 * filter, the profile card). The profile only changes when the player resyncs
 * from the launcher or deletes it, so each mount re-fetching it was wasted
 * round trips. Cleared after a delete.
 */
type ProfileResponse = { profile: Record<string, unknown> | null; status: number };

let cached: Promise<ProfileResponse> | null = null;

export function getMyHardwareProfile(): Promise<ProfileResponse> {
  if (!cached) {
    cached = fetch("/api/hardware/profile")
      .then(async (res) => ({
        status: res.status,
        profile: res.ok ? ((await res.json())?.profile ?? null) : null,
      }))
      .catch(() => {
        cached = null;
        return { status: 0, profile: null };
      });
  }
  return cached;
}

export function clearMyHardwareProfile(): void {
  cached = null;
}
