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
        const ogImage = `https://i.ytimg.com/vi/${entry.videoId}/maxresdefault.jpg`;
        const videoUrl = `https://www.youtube.com/embed/${entry.videoId}?start=${entry.startTime}`;
        const ogAuthor = `yt:channel:UClxj3GlGphZVgd1SLYhZKmg`;
        const modified = injectMeta(html, {
          title: `${entry.title} — Kannaoke`,
          description: `${entry.videoDate} · ${entry.videoTitle}`,
          url: pageUrl,
          ogImage: ogImage,
          videoUrl,
          ogAuthor,
          thumbnailUrl: ogImage,
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
} satisfies ExportedHandler<Env>;

export function injectMeta(html: string, meta: { title: string; description: string; url: string; ogImage?: string; videoUrl?: string; ogAuthor?: string; thumbnailUrl?: string }): string {
  const t = escHtml(meta.title);
  const d = escHtml(meta.description);
  const u = escHtml(meta.url);
  let result = html
     .replace(/(<title>)[^<]*(<\/title>)/, `$1${t}$2`)
     .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${d}$2`)
     .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${t}$2`)
     .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${d}$2`)
     .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${u}$2`)
     .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i, `$1${t}$2`)
     .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i, `$1${d}$2`);

  if (meta.ogImage) {
    result = result.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/i, `$1${escHtml(meta.ogImage)}$2`);
  }
  if (meta.videoUrl) {
    result += `<meta property="og:type" content="video.other" />`;
    result += `<meta property="og:video:url" content="${escHtml(meta.videoUrl)}" />`;
    result += `<meta property="og:video:secure_url" content="${escHtml(meta.videoUrl)}" />`;
    result += `<meta property="og:video:type" content="text/html" />`;
    result += `<meta property="og:video:width" content="1280" />`;
    result += `<meta property="og:video:height" content="720" />`;
    if (meta.thumbnailUrl) {
      result += `<meta property="og:video:thumbnail_url" content="${escHtml(meta.thumbnailUrl)}" />`;
    }
  }
  if (meta.ogAuthor) {
    result = result.replace(/(<meta\s+property="og:author"\s+content=")[^"]*(")/i, `$1${escHtml(meta.ogAuthor)}$2`);
  }

  return result;
}

export function escHtml(s: string): string {
  return s
     .replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
     .replace(/'/g, '&#39;');
}