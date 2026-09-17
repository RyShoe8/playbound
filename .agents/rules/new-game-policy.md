# Policy: Adding New Games to PlayBound

**MANDATORY POLICY:**
1. Before adding any game to PlayBound, you MUST read and follow `platform/docs/new-game-checklist.md`.
2. **Games must ONLY be entered via a browser and the PlayBound Admin Panel (`/admin/games`).**
3. Never insert bare unverified catalog rows into code files. Complete all checklist steps (Install recipe wired for all supported versions/architectures/platforms, accurate download/install sizeMB, Full 8-item Editorial package, Multiplayer adapters, Controller support, Total conversion editions, and Mods) in the same session.
4. **Field Correlation & Data Integrity (Checklist §7):** Always consult the Field Correlation Reference in `platform/docs/new-game-checklist.md`. Ensure each field is populated with curated values rather than leaving scraped site artifacts.
5. **No Duplicate Taglines or Stale Scraped Taxonomy:** Tagline must never duplicate Description. Downloadable desktop games must have `launchMethods: ["install"]`, `browserPlayable: false`, real OS platforms (`Windows`, `Linux`, `macOS`), and never `platforms: ["Web"]` or `browserPlayable: true`.
6. **Mandatory Measured Install Size:** `sizeMB` must represent the actual package archive / installed disk size in megabytes. It must never be left at 0 MB or empty.
