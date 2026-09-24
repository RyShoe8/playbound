/** A missing/failed master-list entry is unknown, never zero players. */
export async function queryManagedPlayerCount(input: {
  queryKind: string;
  host: string;
  port: number;
}): Promise<number | null> {
  if (input.queryKind !== "openra-master") return null;
  try {
    const response = await fetch("https://master.openra.net/games?protocol=2&type=json", {
      headers: { "user-agent": "PlayBound/1.0", accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) return null;
    const address = `${input.host}:${input.port}`;
    const match = rows.find((row) => row && typeof row === "object" && "address" in row && row.address === address) as { players?: unknown } | undefined;
    const count = match?.players;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    return count;
  } catch {
    return null;
  }
}
