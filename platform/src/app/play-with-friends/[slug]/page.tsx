import Link from "next/link";
import { getGame, listGames } from "@/lib/catalog";
import { notFound } from "next/navigation";
import { Users, Gamepad2, Wifi } from "lucide-react";
import {
  getMultiplayerAdapter,
  isPlayBoundManagedMultiplayer,
  MULTIPLAYER_ADAPTERS,
} from "@/lib/multiplayer/adapters";
import {
  hostModeOptions,
  defaultHostMode,
  publicLobbyPortFor,
} from "@/lib/multiplayer/hostModes";
import { pageMetadata } from "@/lib/seo";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  howToSchema,
  ORGANIZATION_ID,
  gameId,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

/*
 * ISR, matched to the live-activity window — see developers/page.tsx.
 *
 * generateStaticParams is what makes `revalidate` count on a dynamic segment;
 * without it Next renders per request and serves `private, no-store`, which is
 * what these 59 pages were doing despite reaching no request-time API.
 *
 * Empty rather than the adapter keys. Listing them looked right — they are a
 * static module and the page 404s outside them — but MULTIPLAYER_ADAPTERS has
 * entries whose game is not published, and those call notFound() during the
 * build rather than at request time. dynamicParams defaults to true, so every
 * slug still renders on first request and is cached after.
 */
export const revalidate = 900;

export async function generateStaticParams() {
  /*
   * Adapters that actually have a published game, which is the same gate the
   * sitemap uses. The adapter map alone is wider than the catalog, and those
   * extra slugs call notFound() — during a build that is an error rather than
   * a 404, which is exactly how the previous attempt at this failed.
   */
  const games = await listGames();
  return games
    .filter((g) => g.slug in MULTIPLAYER_ADAPTERS)
    .map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game || !(slug in MULTIPLAYER_ADAPTERS)) return { title: "Not Found" };

  const managed = isPlayBoundManagedMultiplayer(slug);
  const description = managed
    ? `How to play ${game.title} with friends through PlayBound Connect — no port forwarding, self-hosted or on a PlayBound server.`
    : `How PlayBound gets you and your friends into ${game.title} together. Multiplayer itself runs through ${game.title}'s own service.`;

  return pageMetadata({
    title: `How to Play ${game.title} With Friends`,
    description,
    path: `/play-with-friends/${game.slug}`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

/** Plain-language name for an adapter type, for readers who don't know the jargon. */
function adapterTypeLabel(type: string): string {
  switch (type) {
    case "managed-server":
      return "dedicated server";
    case "direct-ip":
      return "direct connect";
    case "virtual-lan":
      return "LAN-only (bridged over Connect)";
    case "playbound-native":
      return "PlayBound-built multiplayer";
    default:
      return "the game's own service";
  }
}

export default async function PlayWithFriendsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);

  /*
   * A page only exists where PlayBound has something real to say. Games
   * absent from MULTIPLAYER_ADAPTERS fall through getMultiplayerAdapter()'s
   * generic "official" default — that default describes ignorance, not a
   * curated fact, so it must not produce a page.
   */
  if (!game || !(slug in MULTIPLAYER_ADAPTERS)) notFound();

  const adapter = getMultiplayerAdapter(slug);
  const managed = isPlayBoundManagedMultiplayer(slug);
  const modes = hostModeOptions(slug);
  const preferred = defaultHostMode(slug);
  const lobbyPort = publicLobbyPortFor(slug);
  const crossPlay = game.features.some((f) => /cross-?play/i.test(f));
  const multiPlatform = game.platforms.length > 1;

  const hasPublic = modes.some((m) => m.mode === "public");
  const leadAnswer = hasPublic
    ? modes.length > 1
      ? `${game.title} can join a public dedicated server from the live list, or you can host a private room on your own PC or a PlayBound server. Joining a public server is the default.`
      : `${game.title} has a public dedicated-server list. Start a party, pick a server, and Join Game puts everyone on that address.`
    : managed
    ? modes.length > 1
      ? `${game.title} works with PlayBound Connect two ways: host it yourself on your own PC, or run it on a PlayBound server. ${
          preferred === "self" ? "Self-hosting is the default" : "A PlayBound server is the default"
        } — your party reaches the host over Connect's overlay network, so nobody forwards a port.`
      : preferred === "self"
        ? `${game.title} is host-it-yourself through PlayBound Connect. Your PC runs the game and your party reaches it over Connect's overlay network — no port forwarding.`
        : `${game.title} runs on a PlayBound-hosted server. Start a party, launch the game, and PlayBound puts everyone in the same room automatically.`
    : `PlayBound gets you and your friends into ${game.title} together — matching up the party and launching the game for everyone at once. Multiplayer itself, once you're in, runs entirely through ${game.title}'s own service.`;

  const faq: { q: string; a: string }[] = [
    {
      q: `How do I play ${game.title} with friends?`,
      a: leadAnswer,
    },
  ];

  if (game.maxPlayers) {
    faq.push({
      q: `How many players can play ${game.title} together?`,
      a: `${game.title} supports up to ${game.maxPlayers} players in one session.`,
    });
  }

  if (managed) {
    faq.push({
      q: `Do I need to forward a port to host ${game.title}?`,
      a:
        modes.some((m) => m.mode === "self")
          ? `No. Party members reach a self-hosted room over PlayBound Connect's overlay network, which needs no port forwarding. A port is only mapped if you make the room publicly joinable to people outside your party.`
          : `No — PlayBound's server handles hosting, so nothing needs to be opened on your own connection.`,
    });
  }

  if (multiPlatform) {
    faq.push({
      q: `Can players on different platforms play ${game.title} together?`,
      a: crossPlay
        ? `Yes. ${game.title} supports cross-play across ${game.platforms.join(", ")}.`
        : `${game.title} is available on ${game.platforms.join(", ")}, though cross-play support isn't confirmed — check the game's own platform requirements before your party mixes systems.`,
    });
  }

  faq.push({
    q: `Does PlayBound run ${game.title}'s multiplayer servers?`,
    a: managed
      ? `Yes, for the modes above. ${game.title} uses ${adapterTypeLabel(adapter.adapterType)} through PlayBound Connect.`
      : `No. PlayBound handles party presence and launching the game together; the multiplayer connection itself is ${game.title}'s own official service, unmodified.`,
  });

  /*
   * A menu-navigation trail ("Multiplay" -> "Join Game" -> "IP / Direct" ->
   * "Paste Address"), not standalone actions — each fragment is meaningless
   * on its own. Rendered as its own compact sub-list below, matching the
   * precedent in /connect, rather than blended into the numbered steps above
   * as if it were four more top-level actions.
   */
  const inGameMenuSteps = adapter.selfHost?.inGameSteps ?? adapter.client?.inGameSteps ?? [];

  const howToSteps = managed
    ? [
        { text: `Open PlayBound and create or join a party.` },
        { text: `Add ${game.title} as the party's game.` },
        modes.length > 1
          ? {
              text: `Choose how to host: "My computer" for self-hosting, or "PlayBound server" for a room that stays up on its own.`,
            }
          : { text: `PlayBound sets up ${adapterTypeLabel(adapter.adapterType)} automatically.` },
        { text: `Launch. Everyone in the party connects to the same room with no manual setup.` },
        ...(inGameMenuSteps.length
          ? [{ text: `In ${game.title} itself: ${inGameMenuSteps.join(" → ")}.` }]
          : []),
      ]
    : [
        { text: `Open PlayBound and create or join a party.` },
        { text: `Add ${game.title} as the party's game and launch together.` },
        {
          text: `From here, multiplayer runs through ${game.title}'s own service — invite friends, join lobbies, and matchmake the normal way.`,
        },
      ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: `How to Play ${game.title} With Friends`,
            description: leadAnswer,
            url: absoluteUrl(`/play-with-friends/${game.slug}`),
            about: { "@id": gameId(game.slug) },
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            isAccessibleForFree: true,
          },
          faqSchema(faq),
          howToSchema(game, howToSteps),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: game.title, path: `/games/${game.slug}` },
            { name: "Play With Friends", path: `/play-with-friends/${game.slug}` },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Users className="size-4" /> Play together
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        How to Play {game.title} With Friends
      </h1>

      {/* Verdict first — this is what gets quoted. */}
      <div className="mt-6 rounded-xl border-l-4 border-primary bg-card p-6">
        <h2 className="text-xs font-semibold tracking-wide text-primary uppercase">
          Short answer
        </h2>
        <p className="mt-2 text-lg leading-relaxed font-medium">{leadAnswer}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PlayCta game={game} />
        <Link
          href={`/games/${game.slug}`}
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40"
        >
          Full game details
        </Link>
      </div>

      {managed && modes.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Ways to play together</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {modes.map((mode) => (
              <div
                key={mode.mode}
                className={`rounded-xl border p-5 ${
                  mode.mode === preferred ? "border-primary bg-card" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-2">
                  {mode.mode === "self" ? (
                    <Gamepad2 className="size-4 text-primary" />
                  ) : (
                    <Wifi className="size-4 text-primary" />
                  )}
                  <h3 className="font-bold">{mode.label}</h3>
                  {mode.mode === preferred && (
                    <Badge tone="outline" className="ml-auto">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mode.hint}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold">At a glance</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold whitespace-nowrap">
                  Max players
                </th>
                <td className="px-4 py-3 text-muted-foreground">
                  {game.maxPlayers ? `${game.maxPlayers}` : "Not yet verified"}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold whitespace-nowrap">
                  Platforms
                </th>
                <td className="px-4 py-3 text-muted-foreground">{game.platforms.join(", ")}</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold whitespace-nowrap">
                  How PlayBound connects you
                </th>
                <td className="px-4 py-3 text-muted-foreground">
                  {managed
                    ? adapterTypeLabel(adapter.adapterType)
                    : "Party presence and launch only — multiplayer is the game's own service"}
                </td>
              </tr>
              {managed && lobbyPort && (
                <tr>
                  <th scope="row" className="px-4 py-3 font-semibold whitespace-nowrap">
                    Public lobby port
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">
                    {lobbyPort.port}/{lobbyPort.protocol} — only needed to open a self-hosted room
                    to players outside your party
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Step by step</h2>
        <ol className="mt-4 space-y-3">
          {howToSteps.map((step, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {!managed && (
        <section className="mt-12 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">What PlayBound does and doesn&apos;t do here</h2>
          {/*
            One string, not text split across JSX lines around {game.title} —
            a line break immediately after an expression collapses to no
            space at all, not the single space plain prose would get, and
            rendered as "VALORANTtogether" the first time this shipped.
          */}
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {`PlayBound helps you find your friends, form a party, and launch ${game.title} together in one click. It doesn't run ${game.title}'s matchmaking, lobbies, or game servers — that stays exactly as ${game.title} built it, unmodified. If something about multiplayer itself isn't working, that's a ${game.title} question, not a PlayBound one.`}
          </p>
          <p className="mt-3 text-sm">
            <a
              href={game.website}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              {game.title}&apos;s official site →
            </a>
          </p>
        </section>
      )}

      {managed && (
        <section className="mt-12 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Why there&apos;s no port forwarding</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Most home connections can&apos;t accept inbound traffic, which is normally what breaks
            self-hosting. PlayBound Connect puts everyone in the party on one private network
            instead, so the host is directly reachable without opening anything on their router.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/connect" className="font-semibold text-primary hover:underline">
              How PlayBound Connect works →
            </Link>
          </p>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Questions</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {faq.map((item) => (
            <div key={item.q} className="p-4">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
