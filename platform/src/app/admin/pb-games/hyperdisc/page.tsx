import Link from "next/link";
import { connection } from "next/server";
export default async function Page() {
  await connection();
  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-3xl font-bold">HyperDisc</h1>
    <Link href="/admin/pb-games/hyperdisc/mixtapes" prefetch={false} className="block rounded-xl border border-border bg-card p-6 hover:border-primary">
      <h2 className="text-xl font-bold">Mixtapes</h2>
      <p className="mt-2 text-muted-foreground">Upload tracks, manage artist details, and choose the menu soundtrack.</p>
    </Link>
  </div>;
}
