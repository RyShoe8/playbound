/** Agent-side implemented identity contracts. Candidate acceptance is reported separately. Root helpers independently validate
 * their own fixed profiles; this registry cannot grant privileged support.
 * Adding an installation is deliberately separate from accepting isolation.
 */
export const CUSTOMER_IDENTITY_GAMES = Object.freeze([
  "teeworlds",
  "bzflag",
  "hedgewars",
  "openttd",
  "luanti",
  "openarena",
  "battle-for-wesnoth",
  "supertuxkart",
  "0-ad",
  "ysoccer",
  "flightgear",
  "mindustry",
  "hurry-curry",
  "assaultcube",
  "xonotic",
  "wolfenstein-enemy-territory",
  "medal-of-honor-allied-assault",
  "freedoom",
  "freeciv",
  "warzone-2100",
  "hypersomnia",
  "terraria",
  "factorio",
  "unvanquished",
  "openra",
  "openhv",
  "earth-2140-trilogy",
  "rimworld-together",
  "space-station-14",
  "triplea",
  "necesse",
  "veloren",
  "barotrauma",
  "dont-starve-together",
  "morrowind",
  "team-fortress-2",
  "counter-strike-2",
  "trackmania",
  "unturned",
  "bombsquad",
  "counter-strike-source",
  "open-fortress",
  "battlefield-1942-anthology"
]);
export const CUSTOMER_IDENTITY_PROFILES = Object.freeze(CUSTOMER_IDENTITY_GAMES.map(game => `${game}-unix-v1`));
export const CUSTOMER_IDENTITY_PORTS = Object.freeze(Object.fromEntries(
  Object.entries({ teeworlds: [8303,8323], bzflag: [5155,5174], hedgewars: [46631,46650], openttd: [3979,3999], luanti: [30000,30020], openarena: [27960,27980], "battle-for-wesnoth": [15000,15020], supertuxkart: [2759,2779], "0-ad": [20595,20595], ysoccer: [54555,54575], flightgear: [5000,5010], mindustry: [6567,6587], "hurry-curry": [27032,27052], assaultcube: [28763,28781], xonotic: [26000,26020], "wolfenstein-enemy-territory": [27950,27959], "medal-of-honor-allied-assault": [12203,12222], freedoom: [10666,10686], freeciv: [5556,5576], "warzone-2100": [2100,2120], hypersomnia: [8412,8432], terraria: [7870,7890], factorio: [34197,34217], unvanquished: [27965,27975], openra: [1234,1250], openhv: [1255,1270], "earth-2140-trilogy": [1275,1290], "rimworld-together": [25590,25610], "space-station-14": [1212,1222], triplea: [3303,3323], necesse: [14160,14180], veloren: [14004,14004], barotrauma: [27220,27238], "dont-starve-together": [11020,11041], morrowind: [25565,25585], "team-fortress-2": [27015,27025], "counter-strike-2": [27030,27040], trackmania: [23520,23538], unturned: [27075,27099], bombsquad: [43210,43230], "counter-strike-source": [27060,27070], "open-fortress": [27150,27169], "battlefield-1942-anthology": [14567,14586] }).map(([game, ports]) => [game, Object.freeze(ports)]),
));
export function supportsCustomerIdentity(game) {
  return CUSTOMER_IDENTITY_GAMES.includes(game);
}
export function supportsCustomerIdentityProfile(profile) {
  return CUSTOMER_IDENTITY_PROFILES.includes(profile);
}
