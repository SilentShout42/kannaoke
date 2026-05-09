import type { SongEntry } from './songPicker';

interface DiscordEmbed {
  title: string;
  url: string;
  description: string;
  color: number;
  thumbnail: { url: string };
  footer: { text: string };
  timestamp: string;
}

export function buildSongEmbed(song: SongEntry, baseUrl: string): DiscordEmbed {
  const url = `${baseUrl}/?v=${encodeURIComponent(song.videoId)}&t=${encodeURIComponent(String(song.startTime))}`;
  return {
    title: song.title,
    url,
    description: `**${song.artist}**\n${song.videoTitle} · ${song.videoDate}`,
    color: 0xc8902a,
    thumbnail: { url: `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg` },
    footer: { text: 'Kannaoke • Daily Random Song' },
    timestamp: new Date().toISOString(),
  };
}

export async function postToWebhook(webhookUrl: string, embed: DiscordEmbed): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook POST failed: ${res.status} ${text}`);
  }
}
