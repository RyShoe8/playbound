/**
 * The entry for one app in a Steam `appdetails` response.
 *
 * Steam keys the response by app id, but not always the one requested:
 * Ultimate Chicken Horse (386940) comes back keyed "493070", with
 * `data.steam_appid` still 386940. Reading `json[appId]` alone reported such
 * games as "not found". Match the requested key, then the entry whose
 * steam_appid is the requested id, then a lone entry.
 */
export function pickSteamAppEntry<T extends { success?: boolean; data?: unknown }>(
  json: Record<string, T> | null | undefined,
  appId: string | number
): T | undefined {
  if (!json || typeof json !== "object") return undefined;
  const id = String(appId);
  if (json[id]) return json[id];
  const entries = Object.values(json);
  const byData = entries.find(
    (e) => String((e?.data as { steam_appid?: unknown } | undefined)?.steam_appid ?? "") === id
  );
  if (byData) return byData;
  return entries.length === 1 ? entries[0] : undefined;
}
