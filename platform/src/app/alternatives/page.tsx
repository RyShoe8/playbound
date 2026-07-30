import Link from "next/link";
import { Award } from "lucide-react";
import { alternativePages } from "@/lib/data/alternatives";
import { pageMetadata } from "@/lib/seo";
import { JsonLd, graph, breadcrumbSchema, ORGANIZATION_ID } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Free Alternatives to Paid Games",
  description:
    "Free, open-source alternatives to Command & Conquer, Age of Empires, Minecraft, Factorio and more — each assessed against the PlayBound Bar.",
  path: "/alternatives",
});

export default function AlternativesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "CollectionPage",
            name: "Free Alternatives to Paid Games",
            url: absoluteUrl("/alternatives"),
            publisher: { "@id": ORGANIZATION_ID },
          },
          {
            "@type": "ItemList",
            numberOfItems: alternativePages.length,
            itemListElement: alternativePages.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: p.title,
              url: absoluteUrl(`/alternatives/${p.slug}`),
            })),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Alternatives", path: "/alternatives" },
          ])
        )}
      />

      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Award className="size-4" /> Free alternatives
      </div>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Free alternatives to games you&apos;d otherwise pay for
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        For most paid classics there is a free, open-source equivalent that is
        genuinely good — not a knock-off. Every recommendation here has cleared{" "}
        <Link href="/standards" className="font-semibold text-primary hover:underline">
          the PlayBound Bar
        </Link>
        .
      </p>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {alternativePages.map((page) => (
          <li key={page.slug}>
            <Link
              href={`/alternatives/${page.slug}`}
              className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <p className="font-bold">{page.commercialGame}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {page.picks.length} free {page.picks.length === 1 ? "option" : "options"}
                {page.aliases.length ? ` · also ${page.aliases[0]}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
