import { permanentRedirect } from "next/navigation";

// Keep old bookmarks working while Game Deals is the single giveaway destination.
export default function FreeGamesRedirect() {
  permanentRedirect("/deals?type=free");
}
