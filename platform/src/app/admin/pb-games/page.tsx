import Link from "next/link";
import { connection } from "next/server";
export default async function Page() {
  await connection();
  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-3xl font-bold">PB Games</h1>
    <p className="text-muted-foreground">Manage PlayBound games and their in-game content.</p>
    <Link href="/admin/pb-games/hyperdisc" prefetch={false} className="block rounded-xl border border-border bg-card p-6 hover:border-primary">
      <h2 className="text-xl font-bold">HyperDisc</h2>
      <p className="mt-2 text-muted-foreground">Track catalog, cassette collections, and menu music.</p>
    </Link>
  </div>;
}
