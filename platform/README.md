This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Seed the game catalog (production Mongo)

`npm run build` runs `seed:games` after Next.js builds. On Vercel, the first deploy with an empty Mongo catalog upserts games from `src/lib/data/games.ts`. Later builds skip seeding once any catalog docs exist (so Admin CMS edits are not overwritten).

To force a manual seed against an empty DB:

```bash
npx vercel env run -e production -- npm run seed:games
```

### Admin media (covers / screenshots)

On Vercel, add:

- `BLOB_READ_WRITE_TOKEN` — required for Admin image uploads (Vercel Blob)
- `MICROLINK_API_KEY` — optional; enables **Capture screenshot** from a game URL

Without Blob, you can still **Fetch from website** (Open Graph images) and paste remote cover/screenshot URLs. Website import (e.g. `https://tinywind.io/`) prefills a browser-playable draft.

### PlayBound Launcher download (Windows)

1. Build the installer: `cd launcher && npm run dist`
2. From `platform/`, with `BLOB_READ_WRITE_TOKEN` available:
   ```bash
   npm run upload:launcher -- ../launcher/dist/PlayBound-Launcher-Setup-0.1.0.exe
   ```
3. Set the printed URL on Vercel (Production + Preview) as:
   - `NEXT_PUBLIC_LAUNCHER_DOWNLOAD_URL` — public Blob URL for `PlayBound-Launcher-Setup.exe`

The site `/launcher` page and install fallbacks use that URL for one-click download.

To Authenticode-sign the Setup.exe (clears Windows SmartScreen over time), set before `npm run dist`:

- `CSC_LINK` — path to a `.pfx` (or base64-encoded cert)
- `CSC_KEY_PASSWORD` — certificate password

Then set `build.win.signAndEditExecutable` to `true` (or remove the `false` override) in `launcher/package.json`. Without a cert, keep `signAndEditExecutable: false` so unsigned builds succeed on Windows without Developer Mode / symlink privileges.

### Live servers (UDP masters)

HTTP masters (OpenRA, Luanti, SuperTuxKart) are queried directly from Vercel. **Xonotic** and **Unvanquished** use a UDP Master Adapter:

1. Deploy [`platform/master-adapter`](master-adapter/README.md) on Render (Docker).
2. Set on the adapter: `MASTER_ADAPTER_KEY`
3. Set on Vercel Production:
   - `MASTER_ADAPTER_URL` — Render service URL (no trailing slash)
   - `MASTER_ADAPTER_KEY` — same secret

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
