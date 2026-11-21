/** One-time, read-only inventory of the 20 developer slugs reported by Admin. */
import mongoose from "mongoose";
import dbConnect from "../src/lib/db";
import CatalogGame from "../src/lib/models/CatalogGame";
import Developer from "../src/lib/models/Developer";

const slugs = [
  "microsoft-game-studios", "maxis", "missingseven", "lobby",
  "robinson-technologies", "opensc2k", "star-gem-inc", "ruairi-dx",
  "lefto-studio", "playus-soft", "depmify", "556-games", "neognosis",
  "strategy-first", "realm667", "sake906", "impressions-games",
  "rallysimfans", "simon-willison", "mozetech",
];

async function main() {
  await dbConnect();
  const [games, developers] = await Promise.all([
    CatalogGame.find({ developerSlug: { $in: slugs } })
      .select("slug title developerSlug developerName status published website githubRepo")
      .lean(),
    Developer.find({ slug: { $in: slugs } }).select("slug name published").lean(),
  ]);
  for (const slug of slugs) {
    const refs = games.filter((game) => game.developerSlug === slug);
    const developer = developers.find((record) => record.slug === slug);
    console.log(JSON.stringify({
      slug,
      developer: developer ? { name: developer.name, published: developer.published } : null,
      games: refs.map((game) => ({
        slug: game.slug,
        title: game.title,
        developerName: game.developerName,
        status: game.status,
        published: game.published,
        website: game.website,
        githubRepo: game.githubRepo,
      })),
    }));
  }
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
