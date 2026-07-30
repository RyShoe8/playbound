import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Server } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { ServerBrowser } from "@/components/ServerBrowser";
import { JsonLd, graph, faqSchema, breadcrumbSchema } from "@/components/JsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game Not Found" };

  return pageMetadata({
    title: `${game.title} Multiplayer Servers — Live Player Counts`,
    description: `Live public ${game.title} multiplayer servers with current player counts, maps and locations. Free to join, no account required.`,
    path: `/games/${game.slug}/servers`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

export default async function GameServersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const supportsServers = game.launchMethods.includes("server");

  const faq = [
    {
      q: `Does ${game.title} have multiplayer?`,
      a: supportsServers
        ? `Yes. ${game.title} has public multiplayer servers you can join for free. Player counts on this page are live.`
        : `${game.title} does not currently list public dedicated servers on PlayBound. Check the official site for local or peer-to-peer multiplayer options.`,
    },
    {
      q: `Is ${game.title} multiplayer free?`,
      a: `Yes — entirely. ${game.title} is released under ${game.license}, there is no subscription, and public servers are community-run at no cost.`,
    },
    {
      q: `Do I need an account to play ${game.title} online?`,
      a: "No PlayBound account is needed. Some servers ask for a nickname or in-game lobby registration, handled inside the game itself.",
    },
    {
      q: `Is ${game.title} still active?`,
      a: `The player counts on this page are fetched live, so they answer that directly. ${game.qualityBar?.activelyMaintained ? `${game.title} also meets PlayBound's "actively maintained" criterion — it has had a release or meaningful commit within the last twelve months.` : ""}`.trim(),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          faqSchema(faq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Games", path: "/discover" },
            { name: game.title, path: `/games/${game.slug}` },
            { name: "Servers", path: `/games/${game.slug}/servers` },
          ])
        )}
      />

      <Link
        href={`/games/${game.slug}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to {game.title}
      </Link>

      <h1 className="mt-6 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight sm:text-4xl">
        <Server className="size-7 text-primary" />
        {game.title} multiplayer servers
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        Live public servers for {game.title}, with current player counts, maps and
        locations. Everything here is free to join — {game.title} is released under{" "}
        {game.license} and has no subscription or paid multiplayer tier.
      </p>

      <div className="mt-8">
        <ServerBrowser
          slug={game.slug}
          title={game.title}
          supportsServers={supportsServers}
        />
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-bold">Questions</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {faq.map((item) => (
            <div key={item.q} className="p-4">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link href="/servers" className="font-semibold text-primary hover:underline">
          Browse every game&apos;s servers →
        </Link>
        <Link
          href={`/games/${game.slug}/install`}
          className="font-semibold text-primary hover:underline"
        >
          How to install {game.title} →
        </Link>
      </div>
    </div>
  );
}
