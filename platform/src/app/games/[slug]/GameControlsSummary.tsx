import Link from "next/link";
import type { Game } from "@/lib/data/types";
import {
  CONTROL_SCHEME_LABELS,
  documentedSchemes,
  groupBindings,
  hasControls,
  type ControlSchemeBlock,
} from "@/lib/controls/types";

/**
 * A taste of the controls on the game page, with the full set a click away.
 *
 * The game page is the one worth ranking, so it should answer "what are the
 * keys" rather than only linking to somewhere that does. But /controls has to
 * keep a reason to exist: it targets "<game> keybinds", which is its own
 * search with its own intent. So this shows one scheme's first group and says
 * how much more there is, instead of reprinting every table.
 *
 * An <h2> here, an <h1> over there — same subject, different jobs.
 */

/** How many rows to show before the link earns its place. */
const PREVIEW_ROWS = 8;

/** Keyboard first, since it is what most readers arrived wanting. */
function previewScheme(game: Game): ControlSchemeBlock | null {
  const schemes = documentedSchemes(game.controls).filter((s) => s.bindings.length > 0);
  return schemes.find((s) => s.scheme === "keyboard") ?? schemes[0] ?? null;
}

export function GameControlsSummary({ game }: { game: Game }) {
  if (!hasControls(game.controls)) return null;

  const block = previewScheme(game);
  if (!block) return null;

  const groups = groupBindings(block.bindings);
  const first = groups[0];
  if (!first) return null;

  const shown = first.bindings.slice(0, PREVIEW_ROWS);
  const totalBindings = documentedSchemes(game.controls).reduce(
    (n, s) => n + s.bindings.length,
    0
  );
  const remaining = totalBindings - shown.length;
  const schemeCount = documentedSchemes(game.controls).filter((s) => s.bindings.length > 0).length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{game.title} controls</h2>
        <span className="text-xs text-muted-foreground">
          {CONTROL_SCHEME_LABELS[block.scheme]}
          {schemeCount > 1 ? ` · ${schemeCount} input methods` : ""}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {first.group} controls for {game.title} on {CONTROL_SCHEME_LABELS[block.scheme]}
          </caption>
          <tbody>
            {shown.map((binding) => (
              <tr
                key={`${binding.action}-${binding.input}`}
                className="border-b border-border/50 last:border-b-0"
              >
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  {binding.action}
                </th>
                <td className="px-4 py-2 text-right">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {binding.input}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm">
        <Link href={`/games/${game.slug}/controls`} className="font-semibold text-primary underline">
          {remaining > 0
            ? `See all ${totalBindings} ${game.title} controls`
            : `See the full ${game.title} controls reference`}
        </Link>
        {block.notes ? (
          <span className="ml-2 text-xs text-muted-foreground">{block.notes}</span>
        ) : null}
      </p>
    </section>
  );
}
