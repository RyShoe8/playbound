import Link from "next/link";
import { Users, Wifi, Server, Sparkles, Gamepad2, ArrowRight } from "lucide-react";
import { listGames } from "@/lib/catalog";
import {
  MULTIPLAYER_ADAPTERS,
  getMultiplayerAdapter,
  isPlayBoundManagedMultiplayer,
} from "@/lib/multiplayer/adapters";
import { pageMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "How to Play PC Games With Friends — Multiplayer Guides & Setup",
  description:
    "Dedicated guides to playing 50+ PC games with friends: managed servers, virtual LAN without port forwarding, direct connect, and 1-click party launch.",
  path: "/play-with-friends",
});

function adapterLabel(type: string): { label: string; tone: "brand" | "play" | "neutral" | "warn" } {
  switch (type) {
    case "managed-server":
      return { label: "Dedicated Server", tone: "play" };
    case "virtual-lan":
      return { label: "Virtual LAN (CGNAT-Safe)", tone: "brand" };
    case "direct-ip":
      return { label: "Direct Connect", tone: "neutral" };
    case "playbound-native":
      return { label: "Built-in Multiplayer", tone: "play" };
    default:
      return { label: "Party Launch & Voice", tone: "neutral" };
  }
}

export default async function PlayWithFriendsIndexPage() {
  const games = await listGames();
  const multiplayerGames = games
    .filter((g) => g.slug in MULTIPLAYER_ADAPTERS)
    .sort((a, b) => a.title.localeCompare(b.title));

  // Count by category
  const managedCount = multiplayerGames.filter((g) => isPlayBoundManagedMultiplayer(g.slug)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "How to Play PC Games With Friends — Multiplayer Guides & Setup",
            description:
              "Dedicated guides to playing 50+ PC games with friends: managed servers, virtual LAN without port forwarding, direct connect, and 1-click party launch.",
            url: absoluteUrl("/play-with-friends"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: multiplayerGames.length,
            itemListElement: multiplayerGames.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `How to Play ${g.title} With Friends`,
              url: absoluteUrl(`/play-with-friends/${g.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Play With Friends", path: "/play-with-friends" },
          ])
        )}
      />

      {/* Hero Header */}
      <div className="max-w-3xl">
        <Badge tone="play">
          <Users className="size-3.5" /> Play Together
        </Badge>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          How to Play PC Games With Friends
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          No port forwarding, no decade-old VPN tutorials, no broken Hamachi rooms. Every guide
          explains exactly how multiplayer works for that game, whether it needs a private virtual
          LAN, a dedicated server, or 1-click party launch.
        </p>
      </div>

      {/* Feature Highlights Banner */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Wifi className="size-4" /> Virtual LAN (No Port Forwarding)
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Bypass CGNAT and strict NAT routers. Connect bridges everyone into one private network so
            local-only LAN games work over the internet.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Server className="size-4" /> Dedicated Game Servers
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            1-click managed dedicated servers for supported games like Xonotic, Mindustry, and OpenRA.
            Your party gets an instant private room.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <Gamepad2 className="size-4" /> Couch Mode Phone Controllers
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Missing extra controllers for game night? Scan a QR code on your phone to use it as a
            touchscreen gamepad instantly.
          </p>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="mt-12">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              All Multiplayer Setup Guides ({multiplayerGames.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              {managedCount} titles with full PlayBound Connect auto-hosting support
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {multiplayerGames.map((game) => {
            const adapter = getMultiplayerAdapter(game.slug);
            const badge = adapterLabel(adapter.adapterType);
            const isManaged = isPlayBoundManagedMultiplayer(game.slug);

            return (
              <div
                key={game.slug}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone={badge.tone} className="text-[10px]">
                      {badge.label}
                    </Badge>
                    {isManaged && (
                      <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                        <Sparkles className="size-3" /> Connect Ready
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-bold tracking-tight text-card-foreground group-hover:text-primary transition-colors">
                    {game.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {game.tagline || game.description}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {game.genres.slice(0, 2).join(" / ")}
                  </span>
                  <Link
                    href={`/play-with-friends/${game.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    Setup Guide <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
