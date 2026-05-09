# Kannaoke

The Kanna Yanagi Karaoke Index — a searchable index of songs performed during Kanna Yanagi's streams, with timestamps and an embedded YouTube player.

## Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Fuse.js](https://www.fusejs.io/) for fuzzy search
- [Cloudflare Workers](https://workers.cloudflare.com/) for hosting

## Dev setup

Install dependencies:

```bash
npm install
```

Start the local dev server (hot reload, runs in the Cloudflare Workers runtime):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy

Authenticate with Cloudflare (once):

```bash
npx wrangler login
```

Build and deploy:

```bash
npm run deploy
```

This builds the app and deploys it to `kannaoke.<your-subdomain>.workers.dev`. To use a custom domain, add it in the Cloudflare dashboard under the Worker's settings.

## Project structure

```
index.html          Vite entry point
vite.config.ts      Vite + Cloudflare plugin config
wrangler.jsonc      Cloudflare Worker config
src/
  App.tsx           Main app component
  main.tsx          React root
  styles.css        Global styles
worker/
  index.ts          Cloudflare Worker (static asset pass-through)
public/
  performances.json Song data
  ...               Favicons and web manifest
```

## Updating song data

Edit `public/performances.json` directly. Each entry:

```json
{
  "videoId": "YouTube video ID",
  "videoTitle": "Stream title",
  "videoDate": "YYYY-MM-DD",
  "title": "Song title",
  "artist": "Artist name",
  "startTime": 123,
  "endTime": 456
}
```

`endTime` is optional — omit or set to `null` for songs with no defined end.

## Verifying video metadata

`scripts/verify-video-metadata.mjs` checks every `videoTitle` and `videoDate` in `performances.json` against the YouTube Data API and reports any mismatches.

**Get an API key** (free, no billing required):

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project.
2. Enable the **YouTube Data API v3** for the project.
3. Create an **API key** credential (no OAuth needed).

**Run the check:**

```bash
YOUTUBE_API_KEY=<key> node scripts/verify-video-metadata.mjs
```

Or pass the key inline:

```bash
node scripts/verify-video-metadata.mjs --key=<key>
```

**Apply corrections automatically** with `--fix`:

```bash
YOUTUBE_API_KEY=<key> node scripts/verify-video-metadata.mjs --fix
```

This writes corrected `videoTitle` and `videoDate` values back to `performances.json`. Run `npm run prepare:data` afterwards to rebuild the derived files.

> **Note on dates:** the script prefers the actual stream start time for live broadcasts (`liveStreamingDetails.actualStartTime`), falling back to the video's publish date. If a date in `performances.json` was set manually to reflect a different broadcast date, review the diff before committing.
