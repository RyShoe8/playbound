import { SubmitGameForm } from "@/components/SubmitGameForm";
import { listGames } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

const description = "Suggest an edition of a game in the PlayBound catalog. Include its official link and explain how this release differs from the base game.";
export const metadata = pageMetadata({ title: "Submit an edition", description, path: "/submit-edition" });

export default async function Page() {
  const games = (await listGames()).map(({ slug, title }) => ({ slug, title })).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Submit an edition</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <SubmitGameForm kind="edition" games={games} />
    </div>
  );
}
