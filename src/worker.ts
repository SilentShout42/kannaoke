interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
          headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function findEntry(
  env: Env,
  origin: string,
  videoId: string,
  startTime: number,
): Promise<Performance | null> {
  const resp = await env.ASSETS.fetch(new Request(`${origin}/performances.min.json`));
  if (!resp.ok) return null;
  const ct = resp.headers.get('Content-Type') ?? '';
  if (!ct.includes('json')) {
    console.log(JSON.stringify({ event: 'assets_non_json', status: resp.status, ct }));
    return null;
  }
  const data: Performance[] = await resp.json();
  return data.find((p) => p.videoId === videoId && p.startTime === startTime) ?? null;
}

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
    .replace(/"/g, '&quot;');
}
