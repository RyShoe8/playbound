import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Scale } from "lucide-react";
import { getGame } from "@/lib/catalog";
import { comparisons, comparisonsBySlug } from "@/lib/data/comparisons";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cmp = comparisonsBySlug.get(slug);
  if (!cmp) return { title: "Not Found" };

  return pageMetadata({
    title: `${cmp.title} — Which Should You Play?`,
    description: cmp.verdict,
    path: `/compare/${cmp.slug}`,
  });
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cmp = comparisonsBySlug.get(slug);
  if (!cmp) notFound();

  const gameA = await getGame(cmp.aSlug);
  if (!gameA) notFound();

  // B may be a commercial game that is deliberately not in the catalog.
  const gameB = cmp.bExternal ? undefined : await getGame(cmp.bSlug);
  if (!gameB && !cmp.bExternal) notFound();

  const nameA = gameA.title;
  const nameB = gameB?.title ?? cmp.bExternal!.name;

  const faq = [
    { q: `${nameA} or ${nameB} — which should I play?`, a: cmp.verdict },
    { q: `Who should choose ${nameA}?`, a: cmp.chooseA },
    { q: `Who should choose ${nameB}?`, a: cmp.chooseB },
    {
      q: `Are ${nameA} and ${nameB} both free?`,
      a: gameB
        ? `Yes. ${nameA} is released under ${gameA.license} and ${nameB} under ${gameB.license}. Both are entirely free with no trials, paid tiers or in-game purchases.`
        : `${nameA} is free and open-source under ${gameA.license}. ${nameB} is a commercial product and is not free, which is why it is not in the PlayBound catalog.`,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "Article",
            headline: cmp.title,
            description: cmp.verdict,
            url: absoluteUrl(`/compare/${cmp.slug}`),
            author: { "@id": ORGANIZATION_ID },
            publisher: { "@id": ORGANIZATION_ID },
            isAccessibleForFree: true,
          },
          faqSchema(faq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Compare", path: "/compare" },
            { name: cmp.title, path: `/compare/${cmp.slug}` },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Scale className="size-4" /> Head to head
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        {cmp.title}
      </h1>

      {/* Verdict first — this is what gets quoted. */}
      <div className="mt-6 rounded-xl border-l-4 border-primary bg-card p-6">
        <h2 className="text-xs font-semibold tracking-wide text-primary uppercase">
          Short answer
        </h2>
        <p className="mt-2 text-lg leading-relaxed font-medium">{cmp.verdict}</p>
      </div>

      <p className="mt-6 leading-relaxed text-muted-foreground">{cmp.intro}</p>

      <section className="mt-10">
        <h2 className="text-2xl font-bold">
          {nameA} vs {nameB} at a glance
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold"></th>
                <th scope="col" className="px-4 py-3 font-semibold">{nameA}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{nameB}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cmp.rows.map((row) => (
                <tr key={row.aspect}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                    {row.aspect}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{row.a}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Choose {nameA} if…</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">{cmp.chooseA}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {gameA.genres.map((g) => (
              <Badge key={g} tone="outline">{g}</Badge>
            ))}
            <Badge tone="outline">{sizeLabel(gameA.sizeMB)}</Badge>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <PlayCta game={gameA} />
            <Link
              href={`/games/${gameA.slug}`}
              className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40"
            >
              Full details
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Choose {nameB} if…</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">{cmp.chooseB}</p>
          {gameB ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {gameB.genres.map((g) => (
                  <Badge key={g} tone="outline">{g}</Badge>
                ))}
                <Badge tone="outline">{sizeLabel(gameB.sizeMB)}</Badge>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <PlayCta game={gameB} />
                <Link
                  href={`/games/${gameB.slug}`}
                  className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:border-primary/40"
                >
                  Full details
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-muted-foreground">
                {cmp.bExternal!.note}
              </p>
              <a
                href={cmp.bExternal!.website}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                Official site <ExternalLink className="size-3.5" />
              </a>
            </>
          )}
        </div>
      </section>

      {gameA.qualityBar?.verdict && (
        <section className="mt-12 rounded-xl border-l-4 border-primary bg-card p-5">
          <h2 className="text-lg font-bold">Against the PlayBound Bar</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {gameA.qualityBar.verdict}
          </p>
          {gameB?.qualityBar?.verdict && (
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {gameB.qualityBar.verdict}
            </p>
          )}
          <p className="mt-3 text-sm">
            <Link href="/standards" className="font-semibold text-primary hover:underline">
              What the bar measures →
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
