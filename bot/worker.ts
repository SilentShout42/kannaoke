import { pickRandomSong, type SongEntry } from '../src/lib/songPicker';
import { computeNextFireAt } from '../src/lib/schedule';
import { buildSongEmbed, postToWebhook } from '../src/lib/discord';
import { InteractionType } from 'discord-interactions';
import {
  verifyKey,
  pongResponse,
  ephemeralResponse,
  deferredResponse,
  autocompleteResponse,
  postFollowUp,
  createChannelWebhook,
  deleteWebhook,
  type DiscordInteraction,
  type APIEmbed,
} from './discord';

interface ScheduleRow {
  id: number;
  guild_id: string;
  channel_id: string;
  webhook_url: string;
  schedule_hour: number;
  schedule_minute: number;
  timezone: string;
  next_fire_at: number;
  active: number;
}

interface Env {
  DB: D1Database;
  DISCORD_BOT_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  BASE_URL: string;
}


// ─── Command handlers ──────────────────────────────────────────────────────────

async function handleRandom(interaction: DiscordInteraction, env: Env, waitUntil: (p: Promise<void>) => void): Promise<Response> {
  const deferred = deferredResponse();

  waitUntil(
    (async () => {
      try {
        const perfResp = await fetch(`${env.BASE_URL}/performances.min.json`);
        if (!perfResp.ok) {
          throw new Error(`Failed to load song data (${perfResp.status})`);
        }
        const performances: SongEntry[] = await perfResp.json();
        const song = pickRandomSong(performances);
        if (!song) {
          throw new Error('No songs available');
        }
        const embed: APIEmbed = buildSongEmbed(song, env.BASE_URL);
        await postFollowUp(interaction.application_id, interaction.token, undefined, [embed]);
      } catch (err) {
        await postFollowUp(interaction.application_id, interaction.token, String(err), undefined, 64);
      }
    })(),
  );

  return deferred;
}


async function handleScheduleSet(
  interaction: DiscordInteraction,
  env: Env,
  waitUntil: (p: Promise<void>) => void,
): Promise<Response> {
  // Discord nests subcommand options under data.options[0].options
  type SubOpt = { name: string; value: unknown };
  type SubCmd = { name: string; options?: SubOpt[] };
  const subOpts = (interaction.data.options as SubCmd[])?.[0]?.options ?? [];
  const hour = Number(subOpts.find(o => o.name === 'hour')?.value);
  const minute = Number(subOpts.find(o => o.name === 'minute')?.value);
  const timezone = String(subOpts.find(o => o.name === 'timezone')?.value);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return ephemeralResponse('Hour must be 0–23');
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return ephemeralResponse('Minute must be 0–59');
  }

  // Validate timezone — Intl.supportedValuesOf gives us the canonical list
  const validTimezones: string[] = Intl.supportedValuesOf('timeZone');
  if (!validTimezones.includes(timezone)) {
    return ephemeralResponse(`Unknown timezone: ${timezone}. Use the autocomplete suggestions.`);
  }

  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId || !channelId) {
    return ephemeralResponse('This command can only be used in a server channel');
  }

  // Return deferred response immediately, then do async work in background
  const deferred = deferredResponse();

  waitUntil(
    (async () => {
      const newWebhookUrl = await createChannelWebhook(channelId, env.DISCORD_BOT_TOKEN, 'Kannaoke Bot');
      const nextFireAt = computeNextFireAt(hour, minute, timezone);

      await env.DB.prepare(
        `INSERT INTO schedules (guild_id, channel_id, webhook_url, schedule_hour, schedule_minute, timezone, next_fire_at, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, unixepoch())
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          webhook_url = excluded.webhook_url,
          schedule_hour = excluded.schedule_hour,
          schedule_minute = excluded.schedule_minute,
          timezone = excluded.timezone,
          next_fire_at = excluded.next_fire_at,
          active = 1,
          updated_at = unixepoch()`,
        ).bind(guildId, channelId, newWebhookUrl, hour, minute, timezone, nextFireAt).run();

      const h = String(hour).padStart(2, '0');
      const m = String(minute).padStart(2, '0');
      await postFollowUp(
        interaction.application_id,
        interaction.token,
        `Scheduled daily at **${h}:${m} ${timezone}** · First post: <t:${nextFireAt}:F> (<t:${nextFireAt}:R>)`,
      );
    })().catch(async err => {
      console.error(JSON.stringify({ event: 'schedule_set_error', error: String(err) }));
      await postFollowUp(interaction.application_id, interaction.token, `Failed: ${String(err)}`, undefined, 64).catch(() => {});
    }),
  );

  return deferred;
}


async function handleScheduleCancel(interaction: DiscordInteraction, env: Env): Promise<Response> {
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId || !channelId) {
    return ephemeralResponse('This command can only be used in a server channel');
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT webhook_url FROM schedules WHERE guild_id = ? AND channel_id = ? AND active = 1`,
    ).bind(guildId, channelId).all<{ webhook_url: string }>();

    if (!results.length) {
      return ephemeralResponse('No active schedule found for this channel');
    }

    const webhookUrl = results[0].webhook_url;

    await env.DB.prepare(
      `UPDATE schedules SET active = 0, updated_at = unixepoch() WHERE guild_id = ? AND channel_id = ?`,
    ).bind(guildId, channelId).run();

    deleteWebhook(webhookUrl).catch(() => {}); // best effort, schedule already deactivated
    return ephemeralResponse('Schedule cancelled');
  } catch (err) {
    console.error(JSON.stringify({ event: 'schedule_cancel_error', error: String(err) }));
    return ephemeralResponse('Something went wrong. Please try again.');
  }
}

async function handleScheduleStatus(interaction: DiscordInteraction, env: Env): Promise<Response> {
  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId || !channelId) {
    return ephemeralResponse('This command can only be used in a server channel');
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT schedule_hour, schedule_minute, timezone, next_fire_at, active FROM schedules WHERE guild_id = ? AND channel_id = ?`,
    ).bind(guildId, channelId).all<ScheduleRow>();

    if (!results.length || !results[0].active) {
      return ephemeralResponse('No active schedule for this channel. Use /schedule set to configure one.');
    }

    const s = results[0];
    const h = String(s.schedule_hour).padStart(2, '0');
    const m = String(s.schedule_minute).padStart(2, '0');
    return ephemeralResponse(
      `Scheduled daily at **${h}:${m} ${s.timezone}** · Next post: <t:${s.next_fire_at}:F> (<t:${s.next_fire_at}:R>)`,
    );
  } catch (err) {
    console.error(JSON.stringify({ event: 'schedule_status_error', error: String(err) }));
    return ephemeralResponse('Something went wrong. Please try again.');
  }
}

// ─── Autocomplete handler ─────────────────────────────────────────────────────

function fuzzyFilterTimezones(query: string, zones: string[]): string[] {
  if (!query) return zones.slice(0, 25);

  const q = query.toLowerCase();
  type Scored = { zone: string; score: number };

  const scored: Scored[] = [];
  for (const zone of zones) {
    const z = zone.toLowerCase();
    if (z.startsWith(q)) {
      scored.push({ zone, score: 0 });
    } else if (z.includes(q)) {
      scored.push({ zone, score: 1 });
    } else {
      // Fuzzy: all query chars appear in order
      let pos = 0;
      let matched = true;
      for (const ch of q) {
        const idx = z.indexOf(ch, pos);
        if (idx === -1) { matched = false; break; }
        pos = idx + 1;
      }
      if (matched) scored.push({ zone, score: 2 });
    }
  }

  return scored.sort((a, b) => a.score - b.score).slice(0, 25).map(s => s.zone);
}

function handleAutocomplete(interaction: DiscordInteraction): Response {
  type SubOpt = { name: string; value: unknown; focused?: boolean };
  type SubCmd = { name: string; options?: SubOpt[] };
  const subOpts = (interaction.data.options as SubCmd[])?.[0]?.options ?? [];
  const focused = subOpts.find(o => o.focused);

  if (focused?.name === 'timezone') {
    const query = String(focused.value ?? '');
    const zones = fuzzyFilterTimezones(query, Intl.supportedValuesOf('timeZone'));
    return autocompleteResponse(zones.map(z => ({ name: z, value: z })));
  }

  return autocompleteResponse([]);
}

// ─── Interaction router ───────────────────────────────────────────────────────

async function handleInteraction(
  interaction: DiscordInteraction,
  env: Env,
  waitUntil: (p: Promise<void>) => void,
): Promise<Response> {
  if (interaction.type === InteractionType.PING) {
      return pongResponse();
      }

  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      return handleAutocomplete(interaction);
      }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
      return ephemeralResponse(`Unsupported interaction type: ${interaction.type}`);
      }

  const { name } = interaction.data;

  if (name === 'random' || name === 'gacha') {
      return handleRandom(interaction, env, waitUntil);
      }

  if (name === 'schedule') {
    const subcommand = (interaction.data.options as Array<{ name: string }>)?.[0]?.name;
    if (subcommand === 'set') return handleScheduleSet(interaction, env, waitUntil);
    if (subcommand === 'cancel') return handleScheduleCancel(interaction, env);
    if (subcommand === 'status') return handleScheduleStatus(interaction, env);
        // No subcommand = show status by default
    return handleScheduleStatus(interaction, env);
    }

  return ephemeralResponse(`Unknown command: ${name}`);
}

// ─── Fetch handler ─────────────────────────────────────────────────────────────

async function fetchHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname !== '/api/interactions') {
      return new Response('Not found', { status: 404 });
      }
  if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
      }

  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  const rawBody = await request.arrayBuffer();
  const bodyBytes = new Uint8Array(rawBody);

  if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 });
      }

  const valid = await verifyKey(bodyBytes, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  if (!valid) {
      console.log(JSON.stringify({ event: 'bad_signature', ip: request.headers.get('cf-ipCountry') }));
      return new Response('Unauthorized', { status: 401 });
      }

  const interaction: DiscordInteraction = JSON.parse(new TextDecoder().decode(bodyBytes));
  return handleInteraction(interaction, env, _ctx.waitUntil.bind(_ctx));
}

// ─── Scheduled handler ────────────────────────────────────────────────────────

async function fireSchedule(schedule: ScheduleRow, performances: SongEntry[], env: Env): Promise<void> {
  const song = pickRandomSong(performances);
  if (!song) return;

  const embed = buildSongEmbed(song, env.BASE_URL);
  await postToWebhook(schedule.webhook_url, embed);

  const nextFireAt = computeNextFireAt(schedule.schedule_hour, schedule.schedule_minute, schedule.timezone);
  await env.DB.prepare(
        `UPDATE schedules SET next_fire_at = ?, updated_at = unixepoch() WHERE id = ?`,
      ).bind(nextFireAt, schedule.id).run();

  console.log(JSON.stringify({
     event: 'scheduled_post',
     id: schedule.id,
     guildId: schedule.guild_id,
     channelId: schedule.channel_id,
     song: song.title,
     nextFireAt,
    }));
}

// ─── Export ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      return fetchHandler(request, env, ctx);
      },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare(
          `SELECT * FROM schedules WHERE active = 1 AND next_fire_at <= ?`,
        ).bind(nowSec).all<ScheduleRow>();

    if (!results.length) return;

        // Fetch performances once for all schedules
    const perfResp = await fetch(`${env.BASE_URL}/performances.min.json`);
    if (!perfResp.ok) {
      console.error(JSON.stringify({ event: 'scheduled_error', error: `failed to load performances: ${perfResp.status}` }));
      return;
      }
    const performances: SongEntry[] = await perfResp.json();

    ctx.waitUntil(
      Promise.allSettled(
        results.map(s =>
          fireSchedule(s, performances, env).catch(err =>
            console.error(JSON.stringify({ event: 'schedule_error', id: s.id, error: String(err) })),
            ),
          ),
        ),
      );
    },
} satisfies ExportedHandler<Env>;
