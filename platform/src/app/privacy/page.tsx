import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How PlayBound handles your data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: July 25, 2026</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        PlayBound is operated by{" "}
        <a href="https://themediashop.co" className="font-semibold text-primary hover:underline" target="_blank" rel="noreferrer">
          The Media Shop
        </a>
        . This policy explains what we collect and how we use it.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Account information</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When you create an account we store your username, email address, and a hashed password.
          We use this to authenticate you, send verification emails, and personalize your library and
          profile. Library installs synced from the PlayBound app (via a personal launcher token you
          generate) and games you add from the site are stored so your library stays in sync. We do not
          sell your personal information.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Hardware profile</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When you use the PlayBound app while signed in, we may store a hardware profile (CPU, GPU,
          memory, OS, and similar specs) on your account so we can estimate game compatibility. This
          profile is not shown on public profiles. You can view or delete it from your account
          settings.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Email</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Transactional email (verification, account notices) and optional newsletter signup are sent
          via Brevo. If you subscribe to the newsletter, your email is stored for that purpose until
          you unsubscribe or ask us to delete it.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Content you post</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reviews, guides, discussions, event participation, and game submissions are stored so they
          can be shown on PlayBound and moderated by administrators.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Cookies &amp; sessions</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use session cookies required to keep you signed in (NextAuth). We do not use third-party
          advertising trackers on PlayBound.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Contact</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Privacy questions: reach The Media Shop via{" "}
          <a href="https://themediashop.co" className="font-semibold text-primary hover:underline" target="_blank" rel="noreferrer">
            themediashop.co
          </a>
          .
        </p>
      </section>
      <Link href="/" className="inline-block text-sm font-semibold text-primary hover:underline">
        ← Back home
      </Link>
    </article>
  );
}
