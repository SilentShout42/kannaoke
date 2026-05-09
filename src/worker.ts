import { computeNextFireAt } from './lib/schedule';
import { pickRandomSong } from './lib/songPicker';
import type { SongEntry } from './lib/songPicker';
import { buildSongEmbed, postToWebhook } from './lib/discord';

interface Performance {
  videoId: string;
  startTime: number;
  title: string;
  artist: string;
  videoTitle: string;
  videoDate: string;
  membersOnly?: boolean;
  endTime?: number | null;
}

interface SessionData {
  discordId: string;
  username: string;
  avatar: string | null;
}

interface WebhookRow {
  id: string;
  discord_id: string;
  webhook_url: string;
  label: string | null;
  schedule_hour: number;
  schedule_minute: number;
  timezone: string;
  next_fire_at: number;
  active: number;
  created_at: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getSessionCookie(request: Request): string | null {
  const match = request.headers.get('Cookie')?.match(/(?:^|;\s*)session=([^;]+)/);
  return match?.[1] ?? null;
}

function sessionCookieHeader(sessionId: string, maxAge = 2_592_000): string {
  return `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
}

async function requireSession(request: Request, env: Env): Promise<SessionData | Response> {
  const sessionId = getSessionCookie(request);
  if (!sessionId) return json({ error: 'Unauthorized' }, 401);
  const data = await env.SESSIONS.get<SessionData>(`session:${sessionId}`, 'json');
  if (!data) return json({ error: 'Unauthorized' }, 401);
  return data;
}

function requireCsrf(request: Request): Response | null {
  if (request.headers.get('X-Kannaoke-CSRF') !== '1') {
    return json({ error: 'Forbidden' }, 403);
  }
  return null;
}

function validateTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

async function initiateOAuth(request: Request, env: Env): Promise<Response> {
  void request;
  const state = crypto.randomUUID();
  await env.SESSIONS.put(`oauth_state:${state}`, '1', { expirationTtl: 300 });
  const redirectUri = encodeURIComponent(`${env.APP_BASE_URL}/api/auth/discord/callback`);
  const url =
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${env.DISCORD_CLIENT_ID}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=identify` +
    `&state=${state}`;
  return Response.redirect(url, 302);
}

async function handleOAuthCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return json({ error: 'Missing code or state' }, 400);

  const stateVal = await env.SESSIONS.get(`oauth_state:${state}`);
  if (!stateVal) return json({ error: 'Invalid or expired state' }, 400);
  await env.SESSIONS.delete(`oauth_state:${state}`);

  // Exchange code for access token.
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.APP_BASE_URL}/api/auth/discord/callback`,
    }),
  });
  if (!tokenRes.ok) return json({ error: 'Token exchange failed' }, 502);
  const { access_token } = await tokenRes.json<{ access_token: string }>();

  // Fetch Discord user info.
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return json({ error: 'Failed to fetch user info' }, 502);
  const { id, username, avatar } = await userRes.json<{ id: string; username: string; avatar: string | null }>();

  // Upsert user in D1.
  await env.DB.prepare(
    `INSERT INTO users (discord_id, username, avatar)
     VALUES (?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar`,
  ).bind(id, username, avatar ?? null).run();

  // Create session in KV.
  const sessionId = crypto.randomUUID();
  const sessionData: SessionData = { discordId: id, username, avatar: avatar ?? null };
  await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(sessionData), { expirationTtl: 2_592_000 });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.APP_BASE_URL}/?manage=1`,
      'Set-Cookie': sessionCookieHeader(sessionId),
    },
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const sessionId = getSessionCookie(request);
  if (sessionId) await env.SESSIONS.delete(`session:${sessionId}`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader('', 0),
    },
  });
}

// ─── API handlers ─────────────────────────────────────────────────────────────

async function getMe(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  return json({ discordId: session.discordId, username: session.username, avatar: session.avatar });
}

async function listWebhooks(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const { results } = await env.DB.prepare(
    `SELECT id, webhook_url, label, schedule_hour, schedule_minute, timezone, active, created_at
     FROM webhooks WHERE discord_id = ? ORDER BY created_at ASC`,
  ).bind(session.discordId).all<WebhookRow>();
  return json(results);
}

async function createWebhook(request: Request, env: Env): Promise<Response> {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  let body: { webhookUrl?: unknown; label?: unknown; scheduleHour?: unknown; scheduleMinute?: unknown; timezone?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { webhookUrl, label, scheduleHour, scheduleMinute, timezone } = body;
  if (
    typeof webhookUrl !== 'string' ||
    !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhookUrl)
  ) return json({ error: 'Invalid webhookUrl' }, 400);
  if (!Number.isInteger(scheduleHour) || (scheduleHour as number) < 0 || (scheduleHour as number) > 23)
    return json({ error: 'scheduleHour must be 0–23' }, 400);
  if (!Number.isInteger(scheduleMinute) || (scheduleMinute as number) < 0 || (scheduleMinute as number) > 59)
    return json({ error: 'scheduleMinute must be 0–59' }, 400);
  if (typeof timezone !== 'string' || !validateTimezone(timezone))
    return json({ error: 'Invalid timezone' }, 400);

  const { results: countRows } = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM webhooks WHERE discord_id = ?`,
  ).bind(session.discordId).all<{ n: number }>();
  if ((countRows[0]?.n ?? 0) >= 10) return json({ error: 'Maximum of 10 webhooks reached' }, 409);

  const id = crypto.randomUUID();
  const nextFireAt = computeNextFireAt(scheduleHour as number, scheduleMinute as number, timezone);
  await env.DB.prepare(
    `INSERT INTO webhooks (id, discord_id, webhook_url, label, schedule_hour, schedule_minute, timezone, next_fire_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, session.discordId, webhookUrl, label ?? null, scheduleHour, scheduleMinute, timezone, nextFireAt).run();

  return json({ id, webhook_url: webhookUrl, label: label ?? null, schedule_hour: scheduleHour, schedule_minute: scheduleMinute, timezone, active: 1 }, 201);
}

async function updateWebhook(request: Request, url: URL, env: Env): Promise<Response> {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const id = url.pathname.split('/').pop();
  if (!id) return json({ error: 'Missing webhook id' }, 400);

  let body: { webhookUrl?: unknown; label?: unknown; scheduleHour?: unknown; scheduleMinute?: unknown; timezone?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { webhookUrl, label, scheduleHour, scheduleMinute, timezone } = body;
  if (
    typeof webhookUrl !== 'string' ||
    !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhookUrl)
  ) return json({ error: 'Invalid webhookUrl' }, 400);
  if (!Number.isInteger(scheduleHour) || (scheduleHour as number) < 0 || (scheduleHour as number) > 23)
    return json({ error: 'scheduleHour must be 0–23' }, 400);
  if (!Number.isInteger(scheduleMinute) || (scheduleMinute as number) < 0 || (scheduleMinute as number) > 59)
    return json({ error: 'scheduleMinute must be 0–59' }, 400);
  if (typeof timezone !== 'string' || !validateTimezone(timezone))
    return json({ error: 'Invalid timezone' }, 400);

  const nextFireAt = computeNextFireAt(scheduleHour as number, scheduleMinute as number, timezone);
  const result = await env.DB.prepare(
    `UPDATE webhooks
     SET webhook_url = ?, label = ?, schedule_hour = ?, schedule_minute = ?, timezone = ?, next_fire_at = ?
     WHERE id = ? AND discord_id = ?`,
  ).bind(webhookUrl, label ?? null, scheduleHour, scheduleMinute, timezone, nextFireAt, id, session.discordId).run();

  if (!result.meta.changes) return json({ error: 'Not found' }, 404);
  return json({ id, webhook_url: webhookUrl, label: label ?? null, schedule_hour: scheduleHour, schedule_minute: scheduleMinute, timezone, active: 1 });
}

async function deleteWebhook(request: Request, url: URL, env: Env): Promise<Response> {
  const csrf = requireCsrf(request);
  if (csrf) return csrf;
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const id = url.pathname.split('/').pop();
  if (!id) return json({ error: 'Missing webhook id' }, 400);

  const result = await env.DB.prepare(
    `DELETE FROM webhooks WHERE id = ? AND discord_id = ?`,
  ).bind(id, session.discordId).run();

  if (!result.meta.changes) return json({ error: 'Not found' }, 404);
  return json({ ok: true });
}

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  const { method, pathname: p } = { method: request.method, pathname: url.pathname };

  if (p === '/api/auth/discord' && method === 'GET') return initiateOAuth(request, env);
  if (p === '/api/auth/discord/callback' && method === 'GET') return handleOAuthCallback(url, env);
  if (p === '/api/auth/logout' && method === 'POST') return handleLogout(request, env);
  if (p === '/api/me' && method === 'GET') return getMe(request, env);
  if (p === '/api/webhooks' && method === 'GET') return listWebhooks(request, env);
  if (p === '/api/webhooks' && method === 'POST') return createWebhook(request, env);
  if (p.startsWith('/api/webhooks/') && method === 'PATCH') return updateWebhook(request, url, env);
  if (p.startsWith('/api/webhooks/') && method === 'DELETE') return deleteWebhook(request, url, env);

  return json({ error: 'Not found' }, 404);
}

// ─── Scheduled handler ────────────────────────────────────────────────────────

async function fireWebhook(wh: WebhookRow, performances: SongEntry[], env: Env): Promise<void> {
  const song = pickRandomSong(performances);
  if (!song) return;
  const embed = buildSongEmbed(song, env.APP_BASE_URL);
  await postToWebhook(wh.webhook_url, embed);
  const nextFireAt = computeNextFireAt(wh.schedule_hour, wh.schedule_minute, wh.timezone);
  await env.DB.prepare(`UPDATE webhooks SET next_fire_at = ? WHERE id = ?`).bind(nextFireAt, wh.id).run();
  console.log(JSON.stringify({ event: 'webhook_fired', id: wh.id, song: song.title, nextFireAt }));
}

// ─── Static asset cache ───────────────────────────────────────────────────────

const performancesCache = new WeakMap<Fetcher, Performance[]>();

async function findEntry(env: Env, origin: string, videoId: string, startTime: number): Promise<Performance | null> {
  let data = performancesCache.get(env.ASSETS);
  if (!data) {
    const resp = await env.ASSETS.fetch(new Request(`${origin}/performances.min.json`));
    if (!resp.ok) return null;
    const ct = resp.headers.get('Content-Type') ?? '';
    if (!ct.includes('json')) {
      console.log(JSON.stringify({ event: 'assets_non_json', status: resp.status, ct }));
      return null;
    }
    data = await resp.json();
    performancesCache.set(env.ASSETS, data!);
  }
  return data!.find((p) => p.videoId === videoId && p.startTime === startTime) ?? null;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, url, env);
    }

    const v = url.searchParams.get('v');
    const t = url.searchParams.get('t');
    if (v && t) {
      const startTime = parseInt(t, 10);
      const entry = await findEntry(env, url.origin, v, startTime);
      console.log(JSON.stringify({ event: 'entry_lookup', v, t, found: !!entry, title: entry?.title }));
      if (entry) {
        const htmlResp = await env.ASSETS.fetch(new Request(`${url.origin}/`));
        const html = await htmlResp.text();
        const pageUrl = `https://kannaoke.oyasumi99.com/?v=${encodeURIComponent(v)}&t=${encodeURIComponent(t)}`;
        const modified = injectMeta(html, {
          title: `${entry.title} — Kannaoke`,
          description: `${entry.artist} · ${entry.videoDate}`,
          url: pageUrl,
        });
        return new Response(modified, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare(
      `SELECT * FROM webhooks WHERE active = 1 AND next_fire_at <= ?`,
    ).bind(nowSec).all<WebhookRow>();
    if (!results.length) return;

    const perfResp = await env.ASSETS.fetch(new Request(`${env.APP_BASE_URL}/performances.min.json`));
    if (!perfResp.ok) {
      console.error(JSON.stringify({ event: 'scheduled_error', error: 'failed to load performances' }));
      return;
    }
    const performances: SongEntry[] = await perfResp.json();

    ctx.waitUntil(
      Promise.allSettled(
        results.map(wh =>
          fireWebhook(wh, performances, env).catch(err =>
            console.error(JSON.stringify({ event: 'webhook_error', id: wh.id, error: String(err) })),
          ),
        ),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

export function injectMeta(html: string, meta: { title: string; description: string; url: string }): string {
  const t = escHtml(meta.title);
  const d = escHtml(meta.description);
  const u = escHtml(meta.url);
  return html
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${t}$2`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${d}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${t}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${d}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${u}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i, `$1${t}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i, `$1${d}$2`);
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
