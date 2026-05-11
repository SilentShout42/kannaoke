// Discord interaction types and API helpers

export interface DiscordInteraction {
  type: number;
  application_id: string;
  token: string;
  data: {
    name?: string;
    options?: Array<{ name: string; value: unknown }>;
     };
  guild_id?: string;
  channel_id?: string;
}

export interface Embed {
  title: string;
  url: string;
  description: string;
  color: number;
  thumbnail: { url: string };
  footer: { text: string };
  timestamp: string;
}

// ─── Ed25519 verification ─────────────────────────────────────────────────────

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function verifyInteraction(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: Uint8Array,
): Promise<boolean> {
  const combined = new Uint8Array(timestamp.length + body.length);
  combined.set(new TextEncoder().encode(timestamp), 0);
  combined.set(body, timestamp.length);

  const key = await crypto.subtle.importKey(
     'raw',
     base64ToArrayBuffer(publicKey),
     'Ed25519',
     false,
     ['verify'],
   );

  return crypto.subtle.verify(
     'Ed25519',
     key,
     base64ToArrayBuffer(signature),
     combined,
   );
}

// ─── Response builders ────────────────────────────────────────────────────────

function jsonBody(type: number, data?: object): string {
  return JSON.stringify({ type, ...(data ? data : {}) });
}

export function pongResponse(): Response {
  return new Response(jsonBody(1), { headers: { 'Content-Type': 'application/json' } });
}

export function embedResponse(embed: Embed): Response {
  return new Response(jsonBody(4, {
    embeds: [embed],
   }), { headers: { 'Content-Type': 'application/json' } });
}

export function ephemeralResponse(content: string): Response {
  return new Response(jsonBody(4, {
    content,
    flags: 64,
   }), { headers: { 'Content-Type': 'application/json' } });
}

// ─── Deferred response + follow-up ────────────────────────────────────────────
// Send type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) as the HTTP response within 3s.
// Follow-up via POST /webhooks/{application.id}/{interaction.token}/messages/@original.

export function deferredResponse(): Response {
  return new Response(jsonBody(5), { headers: { 'Content-Type': 'application/json' } });
}

export async function postFollowUp(
  applicationId: string,
  token: string,
  content?: string,
  embeds?: Embed[],
  flags?: number,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (content !== undefined) body.content = content;
  if (embeds?.length) body.embeds = embeds;
  if (flags !== undefined) body.flags = flags;

  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
   });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Follow-up failed: ${res.status} ${text}`);
   }
}

// ─── Channel webhook CRUD ─────────────────────────────────────────────────────

export async function createChannelWebhook(
  channelId: string,
  botToken: string,
  name: string,
): Promise<string> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
       'Content-Type': 'application/json',
     },
    body: JSON.stringify({ name }),
   });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create webhook failed: ${res.status} ${text}`);
   }
  const data = await res.json<{ id: string; token: string }>();
  return `https://discord.com/api/webhooks/${data.id}/${data.token}`;
}

export async function deleteWebhook(webhookUrl: string): Promise<void> {
   // webhookUrl format: https://discord.com/api/webhooks/{id}/{token}
  const match = webhookUrl.match(/\/webhooks\/(\d+)\/([\w-]+)/);
  if (!match) throw new Error(`Invalid webhook URL: ${webhookUrl}`);
  const [, id, token] = match;

  const res = await fetch(`https://discord.com/api/v10/webhooks/${id}/${token}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ` },
   });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete webhook failed: ${res.status} ${text}`);
   }
}
