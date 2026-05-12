import { verifyKey, InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import type { APIEmbed } from 'discord-api-types/v10';

export { verifyKey };
export type { APIEmbed };

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
  return JSON.stringify({ type, ...(data ?? {}) });
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
// Edit the original via PATCH /webhooks/{application.id}/{interaction.token}/messages/@original.

export function deferredResponse(): Response {
  return new Response(jsonBody(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE), { headers: { 'Content-Type': 'application/json' } });
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

  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
    method: 'PATCH',
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
