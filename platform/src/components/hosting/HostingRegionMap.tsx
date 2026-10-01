import { CONTIGUOUS_US_STATE_PATHS } from "./usStates";

type Region = { key: string; label: string; salesEnabled: boolean; latitude?: number | null; longitude?: number | null };

/** The same geographic projection used to generate the Census boundary paths. */
export function regionMapPoint(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 24 || latitude > 50 || longitude < -125 || longitude > -66) return null;
  return { x: 24 + (longitude + 125) * 12.6, y: 24 + (50 - latitude) * 13.5 };
}

export function HostingRegionMap({ regions }: { regions: Region[] }) {
  const active = regions.filter((region) => region.salesEnabled);
  return <div className="mt-6">
    <svg viewBox="0 0 800 430" role="img" aria-label={active.length ? `US hosting regions: ${active.map((region) => region.label).join(", ")}` : "Map of the contiguous United States"} className="w-full rounded-2xl border border-border bg-secondary/30">
      <defs>
        <radialGradient id="hosting-map-glow"><stop stopColor="currentColor" stopOpacity="0.12" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></radialGradient>
      </defs>
      {CONTIGUOUS_US_STATE_PATHS.map((path, index) => <path key={index} d={path} className="fill-primary/12 stroke-primary/35" strokeWidth="0.9" strokeLinejoin="round" />)}
      {active.map((region) => {
        const point = region.latitude != null && region.longitude != null ? regionMapPoint(region.latitude, region.longitude) : null;
        return point ? <g key={region.key}>
          <circle cx={point.x} cy={point.y} r="35" fill="url(#hosting-map-glow)" className="text-primary" />
          <circle cx={point.x} cy={point.y} r="11" className="fill-primary/25" />
          <circle cx={point.x} cy={point.y} r="5" className="fill-primary stroke-background" strokeWidth="2" />
          <text x={point.x + 14} y={point.y + 4} className="fill-foreground text-[13px] font-semibold" paintOrder="stroke" stroke="var(--background)" strokeWidth="4">{region.label}</text>
          <title>{region.label}</title>
        </g> : null;
      })}
    </svg>
    <div className="mt-4 flex flex-wrap gap-2">{active.map((region) => <span key={region.key} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium">{region.label}</span>)}</div>
  </div>;
}
