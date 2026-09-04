import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const gamePage = readFileSync(path.join(process.cwd(), "src", "app", "games", "[slug]", "page.tsx"), "utf8");
const controlsPage = readFileSync(path.join(process.cwd(), "src", "app", "games", "[slug]", "controls", "page.tsx"), "utf8");

describe("game controls page frame", () => {
  it("renders controls through the shared game-page frame", () => {
    expect(controlsPage).toContain('import { GamePageFrame } from "../page"');
    expect(controlsPage).toContain('forcedTab="controls"');
    expect(gamePage).toContain('tab === "controls" && <GameControlsContent game={game} />');
  });

  it("keeps the controls URL as an active promoted subnav item", () => {
    expect(gamePage).toContain('href: (slug: string) => `/games/${slug}/controls`');
    expect(gamePage).toContain('tab === r.key ? "border-primary text-foreground"');
  });
});
