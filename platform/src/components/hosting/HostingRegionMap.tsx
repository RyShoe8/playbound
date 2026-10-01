type Region = { key: string; label: string; salesEnabled: boolean; latitude?: number | null; longitude?: number | null };

// Continental US in a simple, intentionally flat projection. Coordinates come
// from the tier's region records, so launching a new location needs no deploy.
function point(region: Region) {
  const fallbacks: Record<string, [number, number]> = {
    "us-central": [41.88, -87.63], "us-east": [39.04, -77.49], "us-west": [37.34, -121.89],
  };
  const [latitude, longitude] = region.latitude != null && region.longitude != null
    ? [region.latitude, region.longitude]
    : fallbacks[region.key] || [NaN, NaN];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { x: 30 + (longitude + 125) / 59 * 540, y: 240 - (latitude - 24) / 26 * 200 };
}

export function HostingRegionMap({ regions }: { regions: Region[] }) {
  const active = regions.filter((r) => r.salesEnabled);
  return <div className="mt-6">
    <svg viewBox="0 0 600 290" role="img" aria-label={active.length ? `US hosting locations: ${active.map((r) => r.label).join(", ")}` : "Map of planned US hosting locations"} className="w-full rounded-xl bg-secondary/40">
      <path d="M34 38 L130 45 L168 52 L208 56 L252 60 L300 56 L350 50 L400 45 L445 42 L468 33 L483 38 L496 47 L523 50 L532 75 L558 82 L568 105 L545 113 L538 135 L557 154 L536 170 L520 190 L505 194 L493 215 L470 224 L447 215 L425 224 L405 220 L380 227 L356 220 L328 234 L305 224 L289 235 L260 229 L242 250 L220 248 L198 222 L170 219 L156 206 L134 192 L116 178 L95 166 L83 145 L63 130 L48 105 Z" fill="currentColor" className="text-primary/10" stroke="currentColor" strokeWidth="2" />
      {active.map((region) => {
        const p = point(region);
        return p ? <g key={region.key}><circle cx={p.x} cy={p.y} r="13" className="fill-primary/25" /><circle cx={p.x} cy={p.y} r="5" className="fill-primary" /><title>{region.label}</title></g> : null;
      })}
    </svg>
    <div className="mt-3 flex flex-wrap gap-2">{active.map((r) => <span key={r.key} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium">{r.label}</span>)}</div>
  </div>;
}
