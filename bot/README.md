# Kannaoke Discord Bot

Posts random songs from the Kannaoke index to Discord channels on demand or on a daily schedule.

## Architecture

```
┌──────────────┐  WebSocket    ┌─────────────────┐  HTTP POST     ┌──────────────────┐
│  Discord      │ ────────────▶│  Discord         │ ──────────────▶│  Cloudflare       │
│  Client       │               │  Servers         │               │  Worker (bot)     │
│  (types       │ ◀──────────── │                  │ ◀───────────── │    /api/          │
│   /random)    │   embed       │  (forwards to    │   deferred +    │   interactions    │
│               │               │   your Worker)   │   follow-up     │                 │
└──────────────┘               └─────────────────┘                 └────────┬─────────┘
                                                                            │ fetches
┌──────────────┐  HTTP POST     ┌──────────────────┐                        │
│  Discord      │ ◀──────────────│  Discord          │ ◀─────────────────────┘
│  Channel      │   (via webhook)│  Servers          │    (fetches song data)
│               │                │  (webhook route)  │
└──────────────┘                 └──────────────────┘
          ▲
          │  HTTP POST (cron fires Worker, Worker calls webhook URL)
          │
┌──────────────────┐
│  Cron Worker      │ ──────────▶ ┌──────────────┐
│   * * * * *       │             │  D1 Database   │
│  (Cloudflare)     │ ◀────────── │  (schedules)  │
└──────────────────┘             └──────────────┘
```

### Where each component runs

| Component | Location | Role |
|---|---|---|
| Slash command definitions | Discord's servers | Shown in every Discord client when the user types `/` |
| **`scripts/register-bot-commands.mjs`** | Run locally (one-time) | Registers `/random`, `/gacha`, `/schedule` with Discord's API. Only needs to run when the command schema changes. |
| **`bot/worker.ts` — fetch handler** | Cloudflare Workers edge | Receives POST requests from **Discord's servers** at `/api/interactions`. Verifies Ed25519 signature, routes the command, and responds. |
| **`bot/worker.ts` — scheduled handler** | Cloudflare Workers edge | Fires every minute via cron trigger (`* * * * *`). Checks D1 for schedules where `next_fire_at <= now`, then posts a song. |
| **`bot/discord.ts`** | Runs inside the Worker | Library — Discord interaction types, Ed25519 verification, response builders (pong, embed, ephemeral, deferred + follow-up), webhook CRUD. |
| **`src/lib/discord.ts`** | Runs inside the Worker | Library — builds the song embed and posts it to a channel webhook. |
| **`src/lib/songPicker.ts`** | Runs inside the Worker | Library — picks a random song from the performances list (filters out members-only + covers by default). |
| **`src/lib/schedule.ts`** | Runs inside the Worker | Library — computes the next fire timestamp from hour/minute/timezone. |
| **D1 Database (`kannaoke-bot-db`)** | Cloudflare D1 | Persists schedule config per guild+channel (hour, minute, timezone, webhook URL). |
| **Kannaoke website** | Cloudflare Workers (separate deployment) | Serves `performances.min.json` — the bot fetches this at request time to pick songs. |
| **Discord Webhooks** | Discord's servers | The bot creates a per-channel webhook for scheduled posts. This decouples scheduled posting from the 3-second interaction response deadline. |

### How the Discord client connects

When you type `/random` in Discord:

1. **Discord Client → Discord's servers** — your client sends the interaction over WebSocket, not to your server directly.
2. **Discord's servers → your Cloudflare Worker** — Discord looks up the **Interactions Endpoint URL** you configured in the [Developer Portal](https://discord.com/developers/applications) and makes an HTTP POST to it.
3. **Your Worker → Discord's servers** — the Worker responds with a deferred message (type 5) to meet the 3s deadline, then follows up asynchronously via the interaction token.
4. **Discord's servers → Discord Client** — the embed flows back to your client so you can see it in the channel.

The Worker never talks to the Discord client directly — all traffic goes through Discord's servers as an intermediary.

## Command flow

### `/random` / `/gacha`

1. User types `/random` in Discord → Discord's servers POST to your Worker at `/api/interactions`
2. Worker verifies Ed25519 signature (`X-Signature-Ed25519`, `X-Signature-Timestamp`)
3. Worker immediately returns a **deferred response** (type 5) to meet Discord's 3s deadline
4. In the background (`waitUntil`), the worker:
    - Fetches `performances.min.json` from the Kannaoke website
    - Picks a random song (skipping members-only and covers)
    - Builds an embed with thumbnail, link, and timestamp
    - Posts it via the interaction follow-up API

### `/schedule set`

1. Same signature verification + deferred response as above
2. In the background:
    - Creates a Discord channel webhook named "Kannaoke Bot"
    - Computes the next fire time from the hour/minute/timezone
    - Upserts the schedule row in D1
3. Confirms via follow-up: "Scheduled! A random song will be posted daily at HH:MM TZ"

### `/schedule cancel`

1. Looks up the active schedule in D1
2. Deactivates the row and deletes the Discord webhook (best effort)
3. Returns an ephemeral confirmation

### `/schedule status`

1. Queries D1 for the schedule row
2. Returns an ephemeral response with the current time and timezone

### Cron trigger (scheduled posts)

1. Cloudflare fires the worker every minute via the cron trigger
2. Worker queries D1 for active schedules where `next_fire_at <= now`
3. Fetches `performances.min.json` once (shared across all schedules)
4. For each matching schedule: picks a random song, posts via the stored webhook, updates `next_fire_at`

## Key design decisions

- **Deferred response + follow-up** for `/random`: the Worker has 3s to respond to Discord. Fetching the performances file and building an embed may take longer, so we defer first then follow up asynchronously.
- **Webhook for scheduled posts**: cron-triggered posts use a webhook rather than the bot token, so they don't require Discord to send an interaction back through the Worker. This also means the post survives if the bot goes down temporarily.
- **No persistent song cache**: the bot fetches `performances.min.json` from the website on every request, so new songs are available immediately after the website deploys.
- **One schedule per guild+channel**: enforced by a unique partial index on `(guild_id, channel_id) WHERE active = 1`.

## Configuration

Environment variables (set in Cloudflare Worker settings):

| Variable | Value |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token for webhook CRUD |
| `DISCORD_PUBLIC_KEY` | Ed25519 public key for signature verification |
| `BASE_URL` | `https://kannaoke.oyasumi99.com` |

## Commands

```bash
cd bot
wrangler dev             # Local dev (forwards Discord interactions via Tunnel)
wrangler deploy          # Deploy to Cloudflare
wrangler d1 execute --name kannaoke-bot-db -f schema.sql    # Initialize DB
```
