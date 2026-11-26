# PlayBound arcade identity

The approved arcade cabinet and custom lowercase wordmark replace the play arrow. Keep the connected y/b letterforms, sky blue `#38BDF8`, navy `#0B141D`, white, and the exact tagline **Discover. Play. Connect.**

## Source and regeneration

`platform/branding/arcade-master.json` contains the outlined vector geometry from the approved concept. All lettering, including the tagline, is paths: exports do not rely on a font being installed. Do not independently redraw the logo in a UI component.

Run from the repository root:

```powershell
node platform/scripts/generate-brand-logos.cjs --export-dir D:/Playbound/Files/Logos/PlayBound-Arcade
node platform/scripts/generate-launcher-icons.cjs
```

The first command creates website SVGs and PNGs, launcher SVGs, browser SVG and Apple touch icons, and the optional local brand kit. The second creates native PNGs and multi-resolution ICOs for Windows and the browser. The small icon is deliberately simplified for 16–64 px. Both use a white cabinet on blue.

## Where it appears

- Website sidebar, mobile navigation menu, footer, email templates, structured Organization logo, all Open Graph templates and the dynamic share-image endpoint.
- Launcher sidebar, Ctrl+P/Friend View titlebar, tray, application icon, Windows installer/uninstaller, macOS and Linux packaging.
- Browser tab: `platform/src/app/favicon.ico` and `icon.svg`. Phone home-screen icon: `apple-icon.png`.

Use the compact horizontal SVG and a separate readable tagline in narrow navigation. Full lockups include the outlined tagline. `on-dark` and `on-light` are transparent; `dark` and `light` include the appropriate solid background. The standalone social icon has generous clear space for circular cropping.

Existing `playbound-warm*`, `playbound-arrow*` and `playbound-logo-120*` download URLs now contain the new artwork so older integrations do not keep showing the arrow. New references should use `playbound-arcade*` names.

## Social handoff

The export folder contains 6000 px logo PNGs, infinitely scalable SVG masters, 4096 px symbol exports, and separate upload folders for Facebook, Bluesky, Reddit and Discord. Facebook and Bluesky covers leave room for avatar overlays. Reddit has dedicated short desktop/mobile banners plus a legacy large-banner alternative. A common 1024 px avatar uses the white cabinet on the blue background.

`Social-posts` has landscape, square, portrait and story artwork. `Additional-channels` includes optional Instagram/TikTok, YouTube and X assets; their presence does not imply those accounts exist. Keep the YouTube lockup in the central crop area. Check the service's crop preview before saving.

Reddit sizing follows its [banner guidelines](https://support.reddithelp.com/hc/en-us/articles/15484339588884-Banner). Discord's [banner guidelines](https://support.discord.com/hc/en-us/articles/360028716472-Server-Banners) advise against text/logo banners, so the Discord pack supplies server/profile icons rather than a text-filled server banner.

These files do not change social profiles automatically. Website deployment publishes the new web assets; already-installed launchers need a new application release. Linux tray copies use content-specific paths to avoid keeping an old cached icon after an update.
