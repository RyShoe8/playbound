/** Rough fiber RTT estimate from great-circle distance (not a real ping). */
export function estimateLatencyMs(
  viewerLat: number,
  viewerLon: number,
  serverLat: number,
  serverLon: number
): number {
  const km = haversineKm(viewerLat, viewerLon, serverLat, serverLon);
  return Math.max(15, Math.round(15 + km * 0.04));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}
