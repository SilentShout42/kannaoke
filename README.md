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
index.html              Vite entry point
vite.config.ts          Vite + Cloudflare plugin config
wrangler.jsonc          Cloudflare Worker config (bindings, cron trigger, vars)
src/
  App.tsx               Main app component
  main.tsx              React root
  styles.css            Global styles
  worker.ts             Cloudflare Worker (OG meta, API routes, cron handler)
  schema.sql            D1 database schema
  lib/
    schedule.ts         DST-safe next-fire-at computation
    songPicker.ts       Random song selection
    discord.ts          Discord embed builder + webhook POST
  components/
    WebhookModal.tsx    Discord sign-in and webhook management UI
public/
  performances.json     Song data
  ...                   Favicons and web manifest
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

## Discord webhook scheduler

Users can sign in with Discord and schedule a daily random song post to any Discord channel via webhook. Each user can manage up to 10 webhooks, each with an independent time and timezone.

### How it works

- A Cloudflare Cron Trigger fires every minute and queries D1 for webhooks whose `next_fire_at` has passed.
- For each due webhook, a random non-members-only, non-cover song is selected and posted as a Discord embed.
- After firing, `next_fire_at` is advanced to the same wall-clock time the next day (DST-aware).

### Discord application setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application.
2. Under **OAuth2**, add the following redirect URIs:
   - `https://kannaoke.oyasumi99.com/api/auth/discord/callback` (production)
   - `http://localhost:5173/api/auth/discord/callback` (local dev)
3. Note the **Client ID** — it is already set as `DISCORD_CLIENT_ID` in `wrangler.jsonc`.
4. Copy the **Client Secret** for use in the next step.

### Secrets

Set the following secrets (never commit these):

```bash
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` can be any long random string — it is reserved for future use (HMAC signing). Generate one with `openssl rand -hex 32`.

### Apply the database schema

```bash
# Production
wrangler d1 execute kannaoke-db --file=src/schema.sql

# Local dev
wrangler d1 execute kannaoke-db --local --file=src/schema.sql
```

### Local development

The dev server runs in the Cloudflare Workers runtime and supports D1 and KV locally out of the box.

1. Apply the schema locally (see above).
2. Set local secrets in `.dev.vars` (this file is git-ignored):

   ```
   DISCORD_CLIENT_SECRET=<your client secret>
   SESSION_SECRET=<any random string>
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Discord OAuth will redirect back to `http://localhost:5173/api/auth/discord/callback` — make sure that URI is registered in your Discord application (see above).

4. To test the cron handler locally, use the Wrangler tail or trigger it manually via the Workers dashboard. You can also invoke it directly:

   ```bash
   curl -X POST "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
   ```

   Note: this endpoint is only available in `wrangler dev`, not in production.

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
