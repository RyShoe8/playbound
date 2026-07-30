import Link from "next/link";
import { Scale } from "lucide-react";
import { comparisons } from "@/lib/data/comparisons";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Free Game Comparisons — Which Should You Play?",
  description:
    "Head-to-head comparisons of the best free games: Beyond All Reason vs Zero-K, 0 A.D. vs OpenRA, Luanti vs Minecraft and more. Clear verdicts, honest differences.",
  path: "/compare",
});

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "Free Game Comparisons",
            url: absoluteUrl("/compare"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: comparisons.length,
            itemListElement: comparisons.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.title,
              url: absoluteUrl(`/compare/${c.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Compare", path: "/compare" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Scale className="size-4" /> Head to head
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Which free game should you actually play?
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Similar games, side by side — with a clear verdict and an honest account of
        where each one falls short.
      </p>

      <ul className="mt-10 grid gap-3">
        {comparisons.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/compare/${c.slug}`}
              className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <p className="font-bold">{c.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.verdict}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
