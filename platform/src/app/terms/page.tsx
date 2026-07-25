import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Terms of Use</h1>
      <p className="text-sm text-muted-foreground">Last updated: July 25, 2026</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        By using PlayBound (operated by{" "}
        <a href="https://themediashop.co" className="font-semibold text-primary hover:underline" target="_blank" rel="noreferrer">
          The Media Shop
        </a>
        ), you agree to these terms.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">The service</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          PlayBound helps you discover free games and optionally install them through the PlayBound
          Launcher. Games remain the property of their respective developers and are downloaded from
          official sources — PlayBound does not host or modify game binaries.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Accounts</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You are responsible for keeping your credentials secure and for activity under your
          account. Provide accurate information and do not impersonate others.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">User content</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reviews, guides, discussions, and game submissions must be lawful and respectful. We may
          remove content or suspend accounts that violate these terms or harm the community.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Disclaimer</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          PlayBound is provided as-is without warranties. Third-party games, sites, and downloads are
          outside our control. Use them at your own risk and follow each project&apos;s license.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Changes</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We may update these terms; continued use after changes means you accept the revised terms.
        </p>
      </section>
      <Link href="/" className="inline-block text-sm font-semibold text-primary hover:underline">
        ← Back home
      </Link>
    </article>
  );
}
