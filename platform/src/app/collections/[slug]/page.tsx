import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollection } from "@/lib/collections";
import { gamesFor } from "@/lib/catalog";
import { CollectionGamesList } from "@/components/CollectionGamesList";
import { Badge } from "@/components/ui/bits";
import { pageMetadata } from "@/lib/seo";
import {
  JsonLd,
  graph,
  collectionPageSchema,
  faqSchema,
  breadcrumbSchema,
} from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return { title: "Collection Not Found" };

  const games = await gamesFor(collection.gameSlugs);
  const names = games.slice(0, 4).map((g) => g.title).join(", ");

  return pageMetadata({
    title: collection.title,
    description: `${games.length} free games hand-picked by PlayBound${names ? `, including ${names}` : ""}. ${collection.description}`,
    path: `/collections/${collection.slug}`,
  });
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) notFound();

  const games = await gamesFor(collection.gameSlugs);

  const faq = [
    {
      q: `What is the best ${collection.title.toLowerCase().replace(/^best /, "")}?`,
      a: games[0]
        ? `PlayBound's top pick is ${games[0].title} — ${games[0].tagline} It is free under ${games[0].license} and runs on ${games[0].platforms.join(", ")}.`
        : collection.description,
    },
    {
      q: `Are all ${games.length} of these games free?`,
      a: "Yes. Every game in this collection is genuinely free — no trials, no paywalled content, no pay-to-win purchases — and each has been assessed against PlayBound's five published criteria.",
    },
  ];

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          collectionPageSchema(collection, games),
          faqSchema(faq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Collections", path: "/collections" },
            { name: collection.title, path: `/collections/${collection.slug}` },
          ])
        )}
      />

      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
        <Badge tone="brand">PlayBound Curated</Badge>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{collection.title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{collection.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {games.length} games · every one clears{" "}
          <Link href="/standards" className="font-semibold text-primary hover:underline">
            the PlayBound Bar
          </Link>
        </p>
      </section>

      <CollectionGamesList games={games} />

      <section>
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
    </div>
  );
}
