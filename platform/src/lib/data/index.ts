
import { developers, developersBySlug } from "./developers";
import { collections, collectionsBySlug } from "./collections";
import type { Game } from "./types";

export * from "./types";
export {
  
  
  
  developersBySlug,
  collections,
  collectionsBySlug,
  
  
  
};

export interface SearchResults {
  games: Game[];
  developers: typeof developers;
  collections: typeof collections;
}
