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
