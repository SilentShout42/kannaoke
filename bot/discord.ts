import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import type { APIEmbed } from 'discord-api-types/v10';

export type { APIEmbed };

// ─── Ed25519 verification ─────────────────────────────────────────────────────
// Discord sends the public key and signature as hex strings.
// Cloudflare Workers require the algorithm name 'Ed25519' (no namedCurve).

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

export async function verifyKey(
  body: Uint8Array,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  const message = new Uint8Array(timestamp.length + body.length);
  message.set(new TextEncoder().encode(timestamp));
  message.set(body, timestamp.length);

  const key = await crypto.subtle.importKey('raw', hexToBytes(publicKey), 'Ed25519', false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, hexToBytes(signature), message);
}

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

// ─── Response builders ────────────────────────────────────────────────────────

function jsonBody(type: number, data?: object): string {
  return JSON.stringify({ type, ...(data ? { data } : {}) });
}

export function pongResponse(): Response {
  return new Response(jsonBody(InteractionResponseType.PONG), { headers: { 'Content-Type': 'application/json' } });
}

export function embedResponse(embed: APIEmbed): Response {
  return new Response(jsonBody(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, {
    embeds: [embed],
  }), { headers: { 'Content-Type': 'application/json' } });
}

export function ephemeralResponse(content: string): Response {
  return new Response(jsonBody(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, {
    content,
    flags: InteractionResponseFlags.EPHEMERAL,
  }), { headers: { 'Content-Type': 'application/json' } });
}

// ─── Deferred response + follow-up ────────────────────────────────────────────
// Send DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE as the HTTP response within 3s.
// Follow up via POST /webhooks/{application.id}/{interaction.token}.

export function deferredResponse(): Response {
  return new Response(jsonBody(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE), { headers: { 'Content-Type': 'application/json' } });
}

export function autocompleteResponse(choices: Array<{ name: string; value: string }>): Response {
  return new Response(JSON.stringify({ type: 8, data: { choices } }), { headers: { 'Content-Type': 'application/json' } });
}

export async function postFollowUp(
  applicationId: string,
  token: string,
  content?: string,
  embeds?: APIEmbed[],
  flags?: number,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (content !== undefined) body.content = content;
  if (embeds?.length) body.embeds = embeds;
  if (flags !== undefined) body.flags = flags;

  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}`, {
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
  const match = webhookUrl.match(/\/webhooks\/(\d+)\/([\w-]+)/);
  if (!match) throw new Error(`Invalid webhook URL: ${webhookUrl}`);
  const [, id, token] = match;

  const res = await fetch(`https://discord.com/api/v10/webhooks/${id}/${token}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete webhook failed: ${res.status} ${text}`);
  }
}
