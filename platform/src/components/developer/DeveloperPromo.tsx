import Link from "next/link";
import { ArrowUpRight, Gamepad2, Users, SlidersHorizontal, ShieldCheck } from "lucide-react";

export function DeveloperPromo() {
  return <div className="space-y-10">
    <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-8 sm:p-12 lg:p-16">
      <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative max-w-3xl space-y-6">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">Built for game creators</p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">Your game. More ways to play.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">Bring your game to PlayBound, where discovery connects directly to playing together. Our open source launcher brings virtual LAN, game streaming, and expanded controller support together to help more people play your game with friends.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/submit-game" className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">Submit your game <ArrowUpRight className="size-4" /></Link>
          <Link href="/developer/claim" className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 font-bold hover:bg-secondary">Claim your game <ShieldCheck className="size-4" /></Link>
        </div>
        <p className="text-sm text-muted-foreground">Already listed? Claim your page to manage its presentation. We’ll ask you to sign in when you’re ready to claim.</p>
      </div>
    </section>
    <section className="grid gap-6 lg:grid-cols-2" aria-label="Multiplayer and controller support">
      <article className="rounded-2xl border border-border bg-card p-7 sm:p-9">
        <Users className="mb-5 size-7 text-primary" />
        <h2 className="text-2xl font-bold">Local multiplayer, together online</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">A game doesn’t need its own online matchmaking to bring friends together. PlayBound provides two ways to connect, depending on how your game’s multiplayer works.</p>
        <h3 className="mt-6 text-lg font-bold">Virtual LAN for LAN multiplayer</h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">Our virtual LAN connects players over the internet as though their computers were on the same local network. Each player runs their own copy of the game and joins its existing LAN multiplayer mode—from another room or another city.</p>
        <h3 className="mt-6 text-lg font-bold">Streaming for couch co-op and shared-screen play</h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">For games designed to be played together on one screen, the host runs the game and streams it to friends. Their controller inputs return to the host, so local co-op and local competitive games can be played together online.</p>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">Virtual LAN requires a game with a LAN mode; streaming is the route for shared-screen games. PlayBound evaluates the appropriate integration for each supported game.</p>
        <Link href="/connect" className="mt-5 inline-flex font-semibold text-primary hover:underline">Explore PlayBound multiplayer →</Link>
      </article>
      <article className="rounded-2xl border border-border bg-card p-7 sm:p-9">
        <Gamepad2 className="mb-5 size-7 text-primary" />
        <h2 className="text-2xl font-bold">Let players use the controller they own</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">PlayBound supports console controllers, USB controllers, and your phone as a controller. Players can bring their preferred input device to supported games rather than being limited to a single controller brand.</p>
        <ul className="mt-5 space-y-3 text-muted-foreground">
          <li><strong className="text-foreground">Console controllers:</strong> Xbox, PlayStation, Nintendo, and other compatible console controllers connected to the player’s computer.</li>
          <li><strong className="text-foreground">USB controllers:</strong> Gamepads and other supported USB input devices, including options beyond the major console brands.</li>
          <li><strong className="text-foreground">Phone controller:</strong> Scan the launcher’s QR code to turn a phone into a controller in its browser—no phone app required. Connect the phone and computer to the same local network, ideal for an extra player when there aren’t enough gamepads.</li>
        </ul>
        <p className="mt-5 leading-relaxed text-muted-foreground">For games without native gamepad support, PlayBound’s controller mappings can translate inputs into keyboard and mouse actions. Game-specific layouts and the in-game helper make those controls easier to find and use.</p>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">Available inputs and layouts depend on the game, device, operating system, and connection method.</p>
        <Link href="/controls" className="mt-5 inline-flex font-semibold text-primary hover:underline">Explore controller support →</Link>
      </article>
    </section>
    <section className="grid gap-5 md:grid-cols-3" aria-label="PlayBound developer benefits">
      {[
        { Icon: Gamepad2, title: "A home for your game", copy: "Share your story, screenshots, trailers, requirements, and download links on a dedicated game page." },
        { Icon: Users, title: "Bring players together", copy: "Help players discover your multiplayer experience, form parties, and connect through community game nights. Available integrations depend on your game." },
        { Icon: SlidersHorizontal, title: "Support that fits your game", copy: "Submit your game so we can evaluate its multiplayer modes and controller mappings. Players can see the supported ways to play directly on your game page." },
      ].map(({ Icon, title, copy }) => <article key={title} className="rounded-2xl border border-border bg-card p-7"><Icon className="mb-5 size-7 text-primary" /><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{copy}</p></article>)}
    </section>
    <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border p-8"><div><h2 className="text-2xl font-bold">You manage your game’s presentation.</h2><p className="mt-2 text-muted-foreground">PlayBound’s reviews and editorial assessments remain independent.</p></div><Link href="/standards" className="font-semibold text-primary hover:underline">Read our standards →</Link></section>
  </div>;
}
