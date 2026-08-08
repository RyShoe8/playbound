import { locationFromCountryName } from "../geo";
import type { GameServer, ServerLocation } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * FlightGear multiplayer hubs.
 *
 * FGMP is a relay mesh (not a classic arena lobby). Player concurrency is not
 * exposed per hub on a stable public API, so rows list known mpserver hosts with
 * location for Est. and players = null.
 *
 * Host list curated from the FlightGear multiplayer wiki (common public hubs).
 */

type FgHub = {
  host: string;
  port: number;
  name: string;
  place: string;
};

const HUBS: FgHub[] = [
  { host: "mpserver01.flightgear.org", port: 5001, name: "mpserver01", place: "Germany" },
  { host: "mpserver02.flightgear.org", port: 5001, name: "mpserver02", place: "Germany" },
  { host: "mpserver03.flightgear.org", port: 5001, name: "mpserver03", place: "Germany" },
  { host: "mpserver04.flightgear.org", port: 5001, name: "mpserver04", place: "United States" },
  { host: "mpserver05.flightgear.org", port: 5001, name: "mpserver05", place: "United States" },
  { host: "mpserver14.flightgear.org", port: 5001, name: "mpserver14", place: "United Kingdom" },
  { host: "mpserver15.flightgear.org", port: 5001, name: "mpserver15", place: "Hong Kong" },
  { host: "mpserver19.flightgear.org", port: 5001, name: "mpserver19", place: "United Kingdom" },
  { host: "mpserver20.flightgear.org", port: 5001, name: "mpserver20", place: "United States" },
  { host: "mpserver21.flightgear.org", port: 5001, name: "mpserver21", place: "Japan" },
  { host: "mpserver22.flightgear.org", port: 5001, name: "mpserver22", place: "Germany" },
  { host: "mpserver25.flightgear.org", port: 5001, name: "mpserver25", place: "India" },
  { host: "mpserver26.flightgear.org", port: 5001, name: "mpserver26", place: "Germany" },
  { host: "mpserver51.flightgear.org", port: 5001, name: "mpserver51", place: "United States" },
];

function locationForPlace(place: string): ServerLocation | null {
  return locationFromCountryName(place);
}

export async function fetchFlightGearServers(): Promise<GameServer[]> {
  const mapped: GameServer[] = HUBS.map((hub) => ({
    id: `${hub.host}:${hub.port}`,
    name: `${hub.name} (${hub.place})`,
    host: hub.host,
    port: hub.port,
    players: null,
    maxPlayers: null,
    map: hub.place,
    gameType: "multiplayer-hub",
    location: locationForPlace(hub.place),
    protected: false,
  }));

  mapped.sort((a, b) => a.name.localeCompare(b.name));
  return mapped.slice(0, MAX_SERVERS);
}
