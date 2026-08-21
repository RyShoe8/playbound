import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Lock, Eye, Cpu, Users, Server, Mail, Trash2, ArrowLeft } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { withOutboundUtm } from "@/lib/utm";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How PlayBound collects, uses, and protects your information across the website, desktop launcher, and community services.",
  path: "/privacy",
});

const mediaShopHref = withOutboundUtm("https://themediashop.co", { campaign: "privacy_policy" });

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Shield className="h-3.5 w-3.5" />
          Transparency First
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: August 14, 2026 · Operates globally
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound is operated by{" "}
          <a
            href={mediaShopHref}
            className="font-semibold text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            The Media Shop
          </a>
          . We built PlayBound on the principle that gaming platforms should respect players. We do not
          sell your data, run third-party behavioral advertising trackers, or hide predatory data
          collection behind confusing settings.
        </p>
      </header>

      {/* Quick Summary Box */}
      <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">No Advertising Networks:</strong> We never monetize through
            ad trackers, behavioral profiling, or selling data.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Full Social Privacy:</strong> You control your presence,
            active game visibility, and party status at all times.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">Private Hardware Diagnostics:</strong> Specs are stored solely
            for game compatibility and are never public.
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <strong className="text-foreground">One-Click Deletion:</strong> You can export or permanently
            erase your account and data at any time.
          </div>
        </div>
      </div>

      {/* Section 1: Account Information */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">1. Account Information</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          When you create an account on PlayBound, we collect:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>
            <strong className="text-foreground">Credentials:</strong> Username, email address, and a
            cryptographically salted and hashed password (never stored in plaintext).
          </li>
          <li>
            <strong className="text-foreground">Profile Details:</strong> Optional avatar, bio, and linked
            social identifiers (e.g. Discord username or ID if connected for party matchmaking).
          </li>
          <li>
            <strong className="text-foreground">Library &amp; Activity:</strong> Games you favorite, collections
            you curate, and installation tokens generated to synchronize your desktop launcher.
          </li>
        </ul>
      </section>

      {/* Section 2: Desktop Launcher & Telemetry */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          2. PlayBound Desktop Launcher &amp; Compatibility
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          The PlayBound Launcher is a lightweight, open companion app for managing free game installations.
          It interacts with our servers in the following ways:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>
            <strong className="text-foreground">Catalog &amp; Updates:</strong> The launcher checks our public API
            for updated game package recipes, release hashes, and server listings.
          </li>
          <li>
            <strong className="text-foreground">Hardware Profile:</strong> When signed in, the launcher can
            benchmark system specifications (CPU tier, GPU model, RAM, OS architecture) to calculate game
            compatibility ratings. This profile is private to your account and can be deleted anytime.
          </li>
          <li>
            <strong className="text-foreground">Installation Telemetry:</strong> To detect dead download mirrors
            and packaging bugs, the launcher sends anonymized telemetry on failed or completed installs (e.g.
            error codes, game slug, app version). No personally identifiable system files or browsing habits
            are ever collected.
          </li>
        </ul>
      </section>

      {/* Section 3: Social Features, Friends & Parties */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          3. Friends, Parties &amp; Presence
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound allows you to connect with friends, discover multiplayer servers, and join game lobbies.
          We provide granular privacy toggles directly in your profile:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>
            <strong className="text-foreground">Activity Privacy:</strong> You can set your presence to
            Public, Friends Only, or Appear Offline.
          </li>
          <li>
            <strong className="text-foreground">Party Invites:</strong> Temporary party lobbies and Discord
            bot invite links expire automatically after matches conclude.
          </li>
        </ul>
      </section>

      {/* Section 4: External Store Links & Deals */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          4. Free Game Deals &amp; Third-Party Stores
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          PlayBound indexes 100% free promotions from official storefronts (such as Epic Games Store, Steam,
          GOG, and Prime Gaming). When you click an external offer or developer link:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>You are navigated directly to the publisher’s canonical website or store page.</li>
          <li>We do not inject affiliate adware, surveillance cookies, or redirect chains.</li>
          <li>Each external storefront governs its own privacy policies when you visit their domain.</li>
        </ul>
      </section>

      {/* Section 5: Cookies & Security */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">5. Cookies &amp; Sessions</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          We use strictly necessary first-party cookies for secure authentication (session management,
          CSRF mitigation). We do not use third-party marketing cookies or surveillance pixels.
        </p>
      </section>

      {/* Section 6: Email Communications */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">6. Email Communications</h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Transactional emails (account verification, password resets) and optional community newsletters
          are sent through our email delivery partner (Brevo). You can opt out of newsletters at any time
          with a single click in any email or in your account preferences.
        </p>
      </section>

      {/* Section 7: Data Retention & Your Rights */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          7. Your Rights (GDPR &amp; CCPA)
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Regardless of your physical location, you have complete ownership over your data:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground sm:text-base">
          <li>
            <strong className="text-foreground">Right to Access &amp; Portability:</strong> Request a copy of all
            personal data associated with your account.
          </li>
          <li>
            <strong className="text-foreground">Right to Deletion:</strong> Permanently delete your account,
            reviews, hardware profiles, and library entries from our servers.
          </li>
          <li>
            <strong className="text-foreground">Right to Rectification:</strong> Update or modify your email,
            username, and profile information directly from your Account Settings.
          </li>
        </ul>
      </section>

      {/* Section 8: Contact & Operator Info */}
      <section className="space-y-3 rounded-xl border border-border bg-card/60 p-5">
        <h2 className="text-lg font-bold text-foreground">8. Contact Us</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          For privacy inquiries, data export requests, or security disclosures, contact{" "}
          <a
            href={mediaShopHref}
            className="font-semibold text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            The Media Shop
          </a>
          . We respond promptly to all data rights requests.
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
        <Link href="/terms" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Terms of Use →
        </Link>
      </div>
    </article>
  );
}
