import Link from "next/link";
import { ArrowUpRight, Gamepad2, Users, SlidersHorizontal, ShieldCheck } from "lucide-react";

export function DeveloperPromo() {
  return <div className="space-y-10">
    <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-8 sm:p-12 lg:p-16">
      <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative max-w-3xl space-y-6">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">Built for game creators</p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Your game. More ways to play.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">Bring your game to PlayBound, where discovery connects directly to playing together. Supported games can gain expanded multiplayer options and increased controller support through our open source launcher.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/submit-game" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">Submit your game <ArrowUpRight className="size-4" /></Link>
          <Link href="/developer/claim" className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 font-bold hover:bg-secondary">Claim your game <ShieldCheck className="size-4" /></Link>
        </div>
        <p className="text-sm text-muted-foreground">Already listed? Claim your page to manage its presentation. We’ll ask you to sign in when you’re ready to claim.</p>
      </div>
    </section>
    <section className="grid gap-5 md:grid-cols-3" aria-label="PlayBound developer benefits">
      {[
        { Icon: Gamepad2, title: "A home for your game", copy: "Share your story, screenshots, trailers, requirements, and download links on a dedicated game page." },
        { Icon: Users, title: "Bring players together", copy: "Help players discover your multiplayer experience, form parties, and connect through community game nights. Available integrations depend on your game." },
        { Icon: SlidersHorizontal, title: "More ways to play", copy: "Explore expanded multiplayer options and controller support with PlayBound. Support is evaluated per game, so players see what actually works." },
      ].map(({ Icon, title, copy }) => <article key={title} className="rounded-2xl border border-border bg-card p-7"><Icon className="mb-5 size-7 text-primary" /><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{copy}</p></article>)}
    </section>
    <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border p-8"><div><h2 className="text-2xl font-bold">You manage your game’s presentation.</h2><p className="mt-2 text-muted-foreground">PlayBound’s reviews and editorial assessments remain independent.</p></div><Link href="/standards" className="font-semibold text-primary hover:underline">Read our standards →</Link></section>
  </div>;
}
