import { availableAt, type Availability } from "./availability";
import { z } from "zod";
export const playPreferencesSchema = z.object({
  mode: z.enum(["any", "genres", "games"]),
  genres: z.array(z.string().trim().min(1).max(80)).max(12),
  games: z.array(z.string().trim().min(1).max(120)).max(20),
  downloads: z.boolean(),
}).refine(p => p.mode === "any" || p[p.mode].length > 0, "Choose at least one game or genre.");
export type PlayPreferences = z.infer<typeof playPreferencesSchema>;
export const defaultPlayPreferences: PlayPreferences = { mode: "any", genres: [], games: [], downloads: false };
export type MatchGame = { slug: string; title: string; genres: string[]; free: boolean };
export function acceptsGame(p: PlayPreferences, g: MatchGame) {
  return p.mode === "any" || (p.mode === "games" ? p.games.includes(g.slug) : g.genres.some(genre => p.genres.includes(genre)));
}

/** Weekly slots start on minute boundaries; one-time windows retain their exact start. */
export function nextPlayTime(availability: Availability, start: number, horizon: number) {
  if (availableAt(availability, start)) return start;
  const exact = availability.window && Date.parse(availability.window.startsAt);
  const windowStart = exact && exact > start && exact <= horizon ? exact : undefined;
  if (availability.weekly.length) {
    for (let t = Math.floor(start / 60000) * 60000 + 60000; t <= (windowStart ?? horizon); t += 60000) {
      if (availableAt(availability, t)) return t;
    }
  }
  return windowStart;
}
