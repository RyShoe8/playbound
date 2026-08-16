import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ShieldAlert, CheckCircle, Scale, AlertTriangle, ArrowLeft } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { withOutboundUtm } from "@/lib/utm";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Use — PlayBound",
  description:
    "Terms governing the use of PlayBound's web services, desktop launcher, and community features.",
  path: "/terms",
});

const mediaShopHref = withOutboundUtm("https://themediashop.co", { campaign: "terms_of_use" });

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <FileText className="h-3.5 w-3.5" />
          Community Agreement
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Terms of Use
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: August 16, 2026 · Effective immediately
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Welcome to PlayBound, operated by{" "}
          <a
            href={mediaShopHref}
            className="font-semibold text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            The Media Shop
          </a>
          . By accessing or using the PlayBound website, desktop launcher application, APIs, or community
          features, you agree to be bound by these Terms of Use.
        </p>
      </header>

      {/* Highlights Box */}
      <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2.5">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Official Sources Only:</strong> PlayBound indexes and installs
            games from official developer repositories and publisher releases.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Developer Rights:</strong> All game copyrights, assets, and
            trademarks remain the property of their respective creators.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Legal Copies Only:</strong> We do not condone piracy. If you
            use a game to play a mod, we assume you already own that game legally.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Respectful Community:</strong> Zero tolerance for harassment,
            toxic conduct, review bombing, or malicious automation.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">As-Is Software:</strong> Community games and client tools are
            provided without warranties; always verify system compatibility.
          </div>
        </div>
      </div>

      {/* Section 1: The PlayBound Service */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">1. The PlayBound Service</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound provides an editorial discovery platform, server browser, mod directory, and companion
          desktop launcher for high-quality free video games.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>
            <strong className="text-foreground">No Binary Hosting / Resale:</strong> PlayBound does not sell,
            re-license, or claim ownership over any game listed in the catalog. All installer recipes fetch
            untampered releases directly from developer-authorized CDNs, GitHub releases, itch.io, or
            official mirrors.
          </li>
          <li>
            <strong className="text-foreground">Free Access:</strong> Core catalog discovery and launcher
            functionality are provided free of charge without mandatory subscription fees.
          </li>
        </ul>
      </section>

      {/* Section 2: Intellectual Property & Developer Attribution */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          2. Intellectual Property &amp; Open Source
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Games cataloged on PlayBound are governed by their respective licenses (e.g. GPL, MIT, Creative
          Commons, Freeware, or custom developer terms).
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound respects the rights of creators and open-source contributors. If you are a developer or
          rights holder and would like to update your project’s metadata, install recipe, or request
          delisting, please contact us or submit a correction via our Developer portal.
        </p>
      </section>

      {/* Section 3: Legal copies & mods */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          3. Legal Copies of Games &amp; Mods
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound does not condone, host, or distribute illegal copies of games. Catalog titles
          are listed from official developer releases, authorized mirrors, and other legitimate
          sources. We do not provide pirated installers, cracked binaries, or circumvention tools.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Some mods require a copy of the original game to play. If you use a game copy to install
          or play a mod through PlayBound, we assume you already own that game legally. You are
          responsible for complying with the game&apos;s license and the laws that apply to you.
          Using PlayBound does not grant you a license to any commercial game you do not own.
        </p>
      </section>

      {/* Section 4: Acceptable Use & Community Guidelines */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          4. Acceptable Use &amp; Code of Conduct
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          When participating in PlayBound community discussions, reviews, party lobbies, and server
          listings, you agree NOT to:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>Engage in harassment, hate speech, threats, discrimination, or abusive conduct.</li>
          <li>Post spam, fraudulent links, malicious scripts, pirated software, or warez.</li>
          <li>
            Manipulate game ratings, submit fabricated reviews, or execute coordinated review bombings.
          </li>
          <li>
            Attempt to disrupt, exploit, or bypass authentication and rate limits on PlayBound services.
          </li>
        </ul>
      </section>

      {/* Section 4: User Accounts & Security */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">5. User Accounts</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          You are responsible for maintaining the confidentiality of your login credentials and for all
          activity under your account. You agree to notify us immediately of any unauthorized account access.
          We reserve the right to suspend or terminate accounts that violate our safety and conduct policies.
        </p>
      </section>

      {/* Section 5: Desktop Launcher & Local Software */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          6. Desktop Launcher &amp; Software Execution
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          The PlayBound Desktop Launcher operates locally on your machine to automate package decompression
          and shortcut creation. Games execute locally using your machine’s hardware and operating system.
          You acknowledge that third-party game stability, multiplayer connectivity, and mods are the
          responsibility of their respective project authors.
        </p>
      </section>

      {/* Section 6: Warranty Disclaimers */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">7. Warranty Disclaimer</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound and its associated tools are provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot;
          basis without warranties of any kind, whether express or implied. We do not warrant that the
          services will be uninterrupted, error-free, or that third-party download mirrors will always remain
          online.
        </p>
      </section>

      {/* Section 7: Limitation of Liability */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">8. Limitation of Liability</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          To the fullest extent permitted by applicable law, The Media Shop and its operators shall not be
          liable for any indirect, incidental, consequential, or punitive damages arising from your use of
          the platform, catalog content, or third-party games.
        </p>
      </section>

      {/* Section 8: Changes & Governing Law */}
      <section className="space-y-3 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-bold text-foreground">9. Changes &amp; Contact</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We may revise these Terms periodically. Continued use of PlayBound constitutes acceptance of the
          revised terms. For legal notices, licensing inquiries, or questions regarding these terms,
          please contact{" "}
          <a
            href={mediaShopHref}
            className="font-semibold text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            The Media Shop
          </a>
          .
        </p>
      </section>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to PlayBound
        </Link>
        <Link href="/privacy" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Privacy Policy →
        </Link>
      </div>
    </article>
  );
}
