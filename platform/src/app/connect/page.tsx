import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Gamepad2,
  MonitorPlay,
  Network,
  Server,
  Shield,
  Users,
  Wifi,
} from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";
import { HOSTABLE_GAMES } from "@/lib/gameHost/catalog";
import { listVirtualLanGames } from "@/lib/multiplayer/adapters";
import { Badge } from "@/components/ui/bits";

export const metadata: Metadata = pageMetadata({
  title: "Connect — Click Join, Land in the Same Game",
  description:
    "PlayBound Connect hosts the room for games that need a server, and puts your party on one shared network for games that only find friends over LAN. No port forwarding either way.",
  path: "/connect",
});

const hostedTitles = Object.values(HOSTABLE_GAMES).map((g) => g.title);
const lanGames = listVirtualLanGames();

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            name: "PlayBound Connect",
            url: absoluteUrl("/connect"),
            description:
              "Hosted multiplayer for free games. Click Join Game and land in the same server.",
            publisher: { "@id": ORGANIZATION_ID },
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Connect", path: "/connect" },
          ])
        )}
      />

      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/25 via-card to-card p-6 sm:p-10">
        <Badge tone="brand">
          <Wifi className="size-3" /> PlayBound Connect
        </Badge>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight">
          Click Join Game. Land in the same game.
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Most home internet cannot accept inbound game traffic. Connect hosts the room on a public
          server. Every player connects out. No port forwarding, no &quot;host migration,&quot; no hoping
          someone&apos;s NAT cooperates.
        </p>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Some games never had a server to host. They look for friends on the local network and stop
          there. For those, Connect puts your whole party on one shared network instead, so a LAN
          session works from four different houses.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/launcher"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <MonitorPlay className="size-4" /> Get the launcher
          </Link>
          <Link
            href="/friends"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-primary/40"
          >
            <Users className="size-4" /> Open Friends
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Server,
            title: "Party hosted rooms",
            text: "Start a party, pick a supported game, hit Join Game. Connect starts the dedicated server and drops everyone in.",
          },
          {
            icon: Network,
            title: "Virtual LAN",
            text: "For LAN-only games. Your party shares one private network, and the game's own discovery finds everyone on it.",
          },
          {
            icon: Gamepad2,
            title: "Public servers",
            text: "Browse live community servers for dozens of titles — the same catalog, a different path than a private party room.",
          },
          {
            icon: Shield,
            title: "Official games",
            text: "We coordinate the party. Their network stays theirs. Presence, ready-up, and launch — not a PlayBound relay.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-5">
            <Icon className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-bold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-extrabold">Games we host for parties</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These titles get a PlayBound dedicated room when your party clicks Join Game. A couple
          still need an in-game join step — Hedgewars takes the address from its own menu. Everyone
          else is launched straight into the room.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {hostedTitles.map((title) => (
            <li
              key={title}
              className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-semibold"
            >
              {title}
            </li>
          ))}
        </ul>
      </section>

      {lanGames.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-extrabold">Games that play over a virtual LAN</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These games have no server to host and no address to type. They find friends by looking
            around the local network, which normally means everyone has to be in the same building.
            Connect gives your party a private network of its own, so &quot;the same building&quot; can be
            four different houses.
          </p>
          <div className="mt-4 space-y-4">
            {lanGames.map((game) => (
              <div key={game.gameSlug} className="rounded-lg border border-border bg-secondary/30 p-4">
                <h3 className="text-sm font-bold">{game.title}</h3>
                {game.virtualLan?.inGameSteps?.length ? (
                  <>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Click Join Game in your party, then in the game:
                    </p>
                    <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {game.virtualLan.inGameSteps.map((step, i) => (
                        <li key={step} className="flex gap-2">
                          <span className="font-bold text-primary">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            The launcher sets the network up and points the game at it. The steps above are the part
            that happens inside the game, where we cannot click for you.
          </p>
        </section>
      )}

      <p className="text-sm">
        <Link href="/servers" className="font-semibold text-primary hover:underline">
          Browse live public servers
        </Link>
        {" · "}
        <Link href="/looking-to-party" className="font-semibold text-primary hover:underline">
          Looking to party
        </Link>
      </p>

      <p className="text-center">
        <Link href="/launcher" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
          How the launcher fits in <ArrowRight className="size-4" />
        </Link>
      </p>
    </div>
  );
}
