import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, { escHtml, injectMeta } from './worker.ts';

// Minimal index.html skeleton matching the real meta tag structure
const BASE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Kannaoke — Default Title</title>
    <meta name="description" content="Default description." />
    <meta property="og:title" content="Default OG Title" />
    <meta property="og:description" content="Default OG description." />
    <meta property="og:url" content="https://kannaoke.oyasumi99.com" />
    <meta name="twitter:title" content="Default Twitter Title" />
    <meta name="twitter:description" content="Default Twitter description." />
  </head>
  <body><div id="root"></div></body>
</html>`;

const SAMPLE_PERFORMANCES = [
  {
    title: 'Near Start',
    artist: 'Artist A',
    videoId: 'q71H8SzQYFc',
    videoTitle: 'Karaoke! Cute Duck Girl Singing for You!',
    videoDate: '2024-08-03',
    startTime: 500,
    membersOnly: false,
  },
  {
    title: 'Song of the Ancients',
    artist: 'Devola · NieR',
    videoId: 'q71H8SzQYFc',
    videoTitle: 'Karaoke! Cute Duck Girl Singing for You!',
    videoDate: '2024-08-03',
    startTime: 7175,
    membersOnly: false,
  },
  {
    title: 'Mid Stream',
    artist: 'Artist B',
    videoId: 'q71H8SzQYFc',
    videoTitle: 'Karaoke! Cute Duck Girl Singing for You!',
    videoDate: '2024-08-03',
    startTime: 12000,
    membersOnly: false,
  },
  {
    title: 'Another Song',
    artist: 'Some Artist',
    videoId: 'anotherVideoId',
    videoTitle: 'Another Stream',
    videoDate: '2024-09-01',
    startTime: 100,
    membersOnly: false,
  },
];

function makeAssets(overrides?: {
  htmlResponse?: Response;
  dataResponse?: Response;
}): { fetch: (req: Request) => Promise<Response> } {
  return {
    fetch: vi.fn(async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/performances.min.json') {
        return overrides?.dataResponse ?? new Response(JSON.stringify(SAMPLE_PERFORMANCES), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return overrides?.htmlResponse ?? new Response(BASE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }),
  };
}

function makeRequest(path: string, ua: string): Request {
  return new Request(`https://kannaoke.oyasumi99.com${path}`, {
    headers: { 'User-Agent': ua },
  });
}

const BOT_UA = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const HUMAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';


describe('escHtml', () => {
  it('escapes ampersand', () => {
    expect(escHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than and greater-than', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes multiple special chars in one string', () => {
    expect(escHtml('a&b<c>d"e')).toBe('a&amp;b&lt;c&gt;d&quot;e');
  });

  it('passes through safe strings unchanged', () => {
    expect(escHtml('Hello World')).toBe('Hello World');
  });
});

describe('injectMeta', () => {
  const meta = {
    title: 'Song of the Ancients — Kannaoke',
    description: 'Devola · NieR · 2024-08-03',
    url: 'https://kannaoke.oyasumi99.com/?v=q71H8SzQYFc&t=7175',
  };

  let result: string;
  beforeEach(() => {
    result = injectMeta(BASE_HTML, meta);
  });

  it('replaces <title>', () => {
    expect(result).toContain('<title>Song of the Ancients — Kannaoke</title>');
    expect(result).not.toContain('Default Title');
  });

  it('replaces meta description', () => {
    expect(result).toContain('name="description" content="Devola · NieR · 2024-08-03"');
  });

  it('replaces og:title', () => {
    expect(result).toContain('property="og:title" content="Song of the Ancients — Kannaoke"');
  });

  it('replaces og:description', () => {
    expect(result).toContain('property="og:description" content="Devola · NieR · 2024-08-03"');
  });

  it('replaces og:url', () => {
    expect(result).toContain('property="og:url" content="https://kannaoke.oyasumi99.com/?v=q71H8SzQYFc&amp;t=7175"');
  });

  it('replaces twitter:title', () => {
    expect(result).toContain('name="twitter:title" content="Song of the Ancients — Kannaoke"');
  });

  it('replaces twitter:description', () => {
    expect(result).toContain('name="twitter:description" content="Devola · NieR · 2024-08-03"');
  });

  it('escapes special chars in injected values', () => {
    const r = injectMeta(BASE_HTML, { title: 'A & B', description: '<desc>', url: 'https://x.com/?a=1&b=2' });
    expect(r).toContain('<title>A &amp; B</title>');
    expect(r).toContain('content="&lt;desc&gt;"');
    expect(r).toContain('content="https://x.com/?a=1&amp;b=2"');
  });

  it('does not inject video tags when videoUrl is omitted', () => {
    const r = injectMeta(BASE_HTML, { title: 'Test', description: 'Desc', url: 'https://x.com/' });
    expect(r).not.toContain('og:video');
  });

  it('does not inject og:image when ogImage is omitted', () => {
    const r = injectMeta(BASE_HTML, { title: 'Test', description: 'Desc', url: 'https://x.com/' });
    expect(r).not.toContain('og:image');
  });

  it('does not inject og:author when ogAuthor is omitted', () => {
    const r = injectMeta(BASE_HTML, { title: 'Test', description: 'Desc', url: 'https://x.com/' });
    expect(r).not.toContain('og:author');
  });
});

describe('worker fetch handler', () => {
  it('passes through requests with no query params', async () => {
    const assets = makeAssets();
    const req = makeRequest('/', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('passes through requests missing v param', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?t=7175', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('treats missing t as t=0 and matches nearest entry', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    // nearest to t=0 among startTimes 500, 7175, 12000 is 500
    expect(html).toContain('<title>Near Start — Kannaoke</title>');
    expect(html).not.toContain('Default Title');
  });

  it('matches exact startTime when provided', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    expect(html).toContain('<title>Song of the Ancients — Kannaoke</title>');
  });

  it('nearest-neighbor: snaps to the closer of two entries', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=3837', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    // 3837 is roughly midway between 500 (diff 3337) and 7175 (diff 3338)
    // nearest is 500 (Near Start)
    expect(html).toContain('<title>Near Start — Kannaoke</title>');
  });

  it('nearest-neighbor: snaps to the later of two entries', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=9600', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    // 9600 is closer to 12000 (diff 2400) than 7175 (diff 2425)
    expect(html).toContain('<title>Mid Stream — Kannaoke</title>');
  });

  it('nearest-neighbor: extreme t beyond all entries picks the closest edge', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=50000', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    // 50000 is farthest from 12000 but that's still the nearest
    expect(html).toContain('<title>Mid Stream — Kannaoke</title>');
  });

  it('does not match entries from a different videoId', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=anotherVideoId&t=100', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    expect(html).toContain('<title>Another Song — Kannaoke</title>');
  });

  it('no match for videoId with no entries — passes through', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=nonexistentVideo&t=0', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('injects meta for any request with matching v+t, regardless of UA', async () => {
    for (const ua of [BOT_UA, HUMAN_UA, 'curl/8.7.1', '']) {
      const assets = makeAssets();
      const req = makeRequest('/?v=q71H8SzQYFc&t=7175', ua);
      const resp = await worker.fetch(req, { ASSETS: assets } as never);
      const html = await resp.text();
      expect(html).toContain('<title>Song of the Ancients — Kannaoke</title>');
      expect(html).toContain('2024-08-03 · Karaoke! Cute Duck Girl Singing for You!');
    }
  });

  it('passes through when videoId has no matching entries', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=nonexistentVideo&t=5000', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('passes through when performances data fetch fails', async () => {
    const assets = makeAssets({ dataResponse: new Response(null, { status: 500 }) });
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('sets Content-Type text/html on injected response', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', HUMAN_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    expect(resp.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });
});
