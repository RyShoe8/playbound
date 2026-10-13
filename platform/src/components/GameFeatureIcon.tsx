import {
  Blocks, BookOpen, Clapperboard, Columns2, Eye, Flag, Gamepad, Gamepad2,
  Handshake, Heart, Joystick, ListOrdered, Map, MapPinned, Network,
  Puzzle, Repeat2, Server, Shapes, Shuffle, Sofa, Sparkles, User, Users,
  type LucideIcon,
} from "lucide-react";

const FEATURE_ICONS: Record<string, LucideIcon> = {
  multiplayer: Users,
  singleplayer: User,
  "co-op": Handshake,
  "couch co-op": Sofa,
  "split-screen co-op": Columns2,
  hotseat: Repeat2,
  "lan support": Network,
  "dedicated servers": Server,
  "cross-play": Shuffle,
  "controller support": Gamepad2,
  "flightstick support": Joystick,
  "playbound controller support": Gamepad,
  "family friendly": Heart,
  "mod support": Puzzle,
  "map editor": Map,
  "level editor": Blocks,
  "custom maps": MapPinned,
  "community content": Shapes,
  replays: Clapperboard,
  "ranked ladder": ListOrdered,
  "spectator mode": Eye,
  "story campaign": BookOpen,
  "team play": Flag,
};

/** Canonical catalog labels, with aliases for older curated feature text. */
export function GameFeatureIcon({ feature, className = "size-4 shrink-0 text-primary" }: { feature: string; className?: string }) {
  const label = feature.trim().toLowerCase().replace(/\s+/g, " ");
  const Icon = FEATURE_ICONS[label]
    ?? (label.includes("controller") || label.includes("gamepad") ? Gamepad2
      : label.includes("flightstick") ? Joystick
        : label.includes("server") ? Server
          : label.includes("mod support") ? Puzzle
            : Sparkles);
  return <Icon className={className} aria-hidden="true" />;
}
