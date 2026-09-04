import { CONTROL_SCHEME_BLURBS, CONTROL_SCHEME_LABELS, documentedSchemes, groupBindings } from "@/lib/controls/types";
import type { Game } from "@/lib/data/types";

export function GameControlsContent({ game }: { game: Game }) {
  return <div className="mx-auto w-full max-w-4xl space-y-8">
    <header className="space-y-3"><h1 className="text-3xl font-black tracking-tight">{game.title} controls</h1><p className="max-w-2xl text-muted-foreground">Default bindings for every input method {game.title} supports. These are the game&apos;s own defaults — anything you have remapped will differ.</p>{game.controls?.notes ? <p className="max-w-2xl rounded-lg border border-border bg-muted/40 p-3 text-sm">{game.controls.notes}</p> : null}</header>
    {documentedSchemes(game.controls).map((block) => <section key={block.scheme} className="space-y-4">
      <div className="space-y-1"><h2 className="text-xl font-bold">{CONTROL_SCHEME_LABELS[block.scheme]}</h2><p className="text-sm text-muted-foreground">{block.supported ? CONTROL_SCHEME_BLURBS[block.scheme] : `${game.title} does not support this input method.`}</p></div>
      {block.notes ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{block.notes}</p> : null}
      {groupBindings(block.bindings).map(({ group, bindings }) => <div key={group} className="overflow-x-auto"><table className="w-full border-collapse text-sm"><caption className="pb-2 text-left font-semibold">{group} — {CONTROL_SCHEME_LABELS[block.scheme]}</caption><thead><tr className="border-b border-border text-left"><th scope="col" className="py-2 pr-4 font-semibold">Action</th><th scope="col" className="py-2 font-semibold">Default input</th></tr></thead><tbody>{bindings.map((binding) => <tr key={`${binding.action}-${binding.input}`} className="border-b border-border/50"><th scope="row" className="py-2 pr-4 text-left font-normal">{binding.action}{binding.note ? <span className="block text-xs text-muted-foreground">{binding.note}</span> : null}</th><td className="py-2"><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{binding.input}</kbd></td></tr>)}</tbody></table></div>)}
      {block.sourceUrl ? <p className="text-xs text-muted-foreground">Source: <a href={block.sourceUrl} rel="nofollow noopener noreferrer" target="_blank" className="underline">{block.sourceLabel || "official documentation"}</a>{block.verified ? " · verified against the game by PlayBound" : null}</p> : block.verified ? <p className="text-xs text-muted-foreground">Verified against the game by PlayBound.</p> : null}
    </section>)}
  </div>;
}
