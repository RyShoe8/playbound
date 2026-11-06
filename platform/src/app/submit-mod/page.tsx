import { SubmitGameForm } from "@/components/SubmitGameForm";
import { listGames } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

const description = "Suggest a mod for a game in the PlayBound catalog. Include the project link and explain what it changes and which versions it supports.";
export const metadata = pageMetadata({ title: "Submit a mod", description, path: "/submit-mod" });

export default async function Page() {
  const games = (await listGames()).map(({ slug, title }) => ({ slug, title })).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Submit a mod</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <SubmitGameForm kind="mod" games={games} />
    </div>
  );
}
