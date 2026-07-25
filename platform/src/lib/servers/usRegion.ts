/** US East / Central / West from state code or longitude. */

const WEST_STATES = new Set([
  "AK",
  "HI",
  "WA",
  "OR",
  "CA",
  "NV",
  "ID",
  "MT",
  "WY",
  "UT",
  "AZ",
  "NM",
  "CO",
]);

const CENTRAL_STATES = new Set([
  "ND",
  "SD",
  "NE",
  "KS",
  "OK",
  "TX",
  "MN",
  "IA",
  "MO",
  "AR",
  "LA",
  "WI",
  "IL",
  "MI",
  "IN",
  "OH",
  "KY",
  "TN",
  "MS",
  "AL",
]);

const EAST_STATES = new Set([
  "FL",
  "GA",
  "SC",
  "NC",
  "VA",
  "WV",
  "MD",
  "DE",
  "PA",
  "NJ",
  "NY",
  "CT",
  "RI",
  "MA",
  "VT",
  "NH",
  "ME",
  "DC",
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

export type UsDivision = "East" | "Central" | "West";

function codeFromRegion(region?: string, regionCode?: string): string | null {
  if (regionCode && /^[A-Z]{2}$/i.test(regionCode)) return regionCode.toUpperCase();
  if (!region) return null;
  const trimmed = region.trim();
  if (/^[A-Z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? null;
}

function divisionFromState(code: string): UsDivision | null {
  if (WEST_STATES.has(code)) return "West";
  if (CENTRAL_STATES.has(code)) return "Central";
  if (EAST_STATES.has(code)) return "East";
  return null;
}

/** Longitude bands for continental US when state is unknown. */
function divisionFromLon(lon: number): UsDivision {
  if (lon <= -104) return "West";
  if (lon <= -87) return "Central";
  return "East";
}

export function classifyUsDivision(opts: {
  region?: string;
  regionCode?: string;
  lat?: number;
  lon?: number;
}): UsDivision | null {
  const code = codeFromRegion(opts.region, opts.regionCode);
  if (code) {
    const fromState = divisionFromState(code);
    if (fromState) return fromState;
  }
  if (opts.lon != null && Number.isFinite(opts.lon)) {
    return divisionFromLon(opts.lon);
  }
  return null;
}

export function usLocationLabel(division: UsDivision): string {
  return `US ${division}`;
}
