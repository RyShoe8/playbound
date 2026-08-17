import { revalidatePath } from "next/cache";
import LibraryModEntry from "@/lib/models/LibraryModEntry";

/** Drop every installed-mod row for a base game and refresh the pages that show it. */
export async function removeLibraryModsForGame(
  userId: string,
  baseGameSlug: string
): Promise<void> {
  const mods = await LibraryModEntry.find({ userId, baseGameSlug })
    .select("modSlug")
    .lean();
  await LibraryModEntry.deleteMany({ userId, baseGameSlug });
  revalidatePath("/library");
  revalidatePath(`/games/${baseGameSlug}`);
  for (const m of mods) {
    revalidatePath(`/mods/${String(m.modSlug)}`);
  }
}

export function revalidateLibraryPages(gameSlug?: string, modSlug?: string) {
  revalidatePath("/library");
  if (gameSlug) revalidatePath(`/games/${gameSlug}`);
  if (modSlug) revalidatePath(`/mods/${modSlug}`);
}
