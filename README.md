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
wrangler.jsonc          Cloudflare Worker config
src/
  App.tsx               Main app component
  main.tsx              React root
  styles.css            Global styles
  worker.ts             Cloudflare Worker (OG meta injection for link unfurling)
  lib/
    schedule.ts         DST-safe next-fire-at computation
    songPicker.ts       Random song selection
    discord.ts          Discord embed builder + webhook POST (shared with bot)
public/
  performances.json     Song data
    ...                 Favicons and web manifest
bot/
  worker.ts             Discord bot (interaction handler + cron scheduler)
  discord.ts            Discord API helpers (verification, responses, webhooks)
  schema.sql            D1 schema (schedules table)
  wrangler.jsonc        Bot worker config
scripts/
  register-bot-commands.mjs  Slash command registration
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

## Discord bot

A standalone Discord bot supports `/random` (alias `/gacha`) for posting random songs and `/schedule` for daily automated posts. The bot lives in the `bot/` directory.

### Commands

| Command | Description |
|---|---|
| `/random` | Post a random song to the channel |
| `/gacha` | Same as `/random` |
| `/schedule set` | Set up daily scheduled posting |
| `/schedule cancel` | Disable scheduled posting |
| `/schedule status` | Show current schedule |

### Setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application named "Kannaoke Bot".
2. Under **Bot**, create a bot and copy the **Token** and **Public Key**.
3. Under **OAuth2**, generate a bot invite URL with these scopes and permissions:
    - Scopes: `bot`
    - Bot Permissions: `Send Messages`, `Embed Links`, `Manage Webhooks`
4. Set the **Interactions Endpoint URL** to `https://kannaoke-bot.oyasumi99.com/api/interactions` (or your `.workers.dev` URL during development).
5. Create the D1 database and apply the schema:

    ```bash
   wrangler d1 create kannaoke-bot-db
    # Update bot/wrangler.jsonc with the database_id from above
   wrangler d1 execute kannaoke-bot-db --file=bot/schema.sql
    ```

6. Set secrets:

    ```bash
   wrangler secret put DISCORD_BOT_TOKEN --config bot/wrangler.jsonc
   wrangler secret put DISCORD_PUBLIC_KEY --config bot/wrangler.jsonc
    ```

7. Register slash commands:

    ```bash
   DISCORD_CLIENT_ID=<your-client-id> DISCORD_BOT_TOKEN=<your-token> npm run bot:register
    ```

8. Deploy:

    ```bash
   npm run bot:deploy
    ```

9. Invite the bot to your server using the URL from step 3.

### Project structure

```
bot/
  worker.ts          Interaction handler + cron scheduler
  discord.ts         Discord API helpers (verification, responses, webhooks)
  schema.sql         D1 schema (schedules table)
  wrangler.jsonc     Worker config
scripts/
  register-bot-commands.mjs  Slash command registration
```

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
