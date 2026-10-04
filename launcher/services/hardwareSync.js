"use strict";

/**
 * Whether to scan this PC's hardware and upload it.
 *
 * Once a profile is stored on the account, the launcher and website read that
 * stored copy; re-detecting is the player's choice (Resync). This used to
 * re-scan on the first launch of every day and on every sign-in, which is
 * slow (systeminformation) and made the "will this run" panels flicker
 * through loading states for facts that had not changed. A different account
 * signing in on this PC still gets its own first sync.
 */
function shouldSyncHardwareProfile(settings, force = false, account = null) {
  if (force) return true;
  if (!settings?.launcherToken) return false;
  if (!settings.hardwareProfileSyncedAt || !settings.hardwareProfile) return true;
  if (account && settings.hardwareProfileSyncedFor && settings.hardwareProfileSyncedFor !== account) return true;
  return false;
}

module.exports = { shouldSyncHardwareProfile };
