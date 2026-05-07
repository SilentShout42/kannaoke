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
    title: 'Song of the Ancients',
    artist: 'Devola · NieR',
    videoId: 'q71H8SzQYFc',
    videoTitle: 'Karaoke! Cute Duck Girl Singing for You!',
    videoDate: '2024-08-03',
    startTime: 7175,
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
        return overrides?.dataResponse ?? new Response(JSON.stringify(SAMPLE_PERFORMANCES), { status: 200 });
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
    description: 'Devola · NieR · 2024-08-03 · Karaoke! Cute Duck Girl Singing for You!',
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
    expect(result).toContain('name="description" content="Devola · NieR · 2024-08-03 · Karaoke! Cute Duck Girl Singing for You!"');
  });

  it('replaces og:title', () => {
    expect(result).toContain('property="og:title" content="Song of the Ancients — Kannaoke"');
  });

  it('replaces og:description', () => {
    expect(result).toContain('property="og:description" content="Devola · NieR · 2024-08-03 · Karaoke! Cute Duck Girl Singing for You!"');
  });

  it('replaces og:url', () => {
    expect(result).toContain('property="og:url" content="https://kannaoke.oyasumi99.com/?v=q71H8SzQYFc&amp;t=7175"');
  });

  it('replaces twitter:title', () => {
    expect(result).toContain('name="twitter:title" content="Song of the Ancients — Kannaoke"');
  });

  it('replaces twitter:description', () => {
    expect(result).toContain('name="twitter:description" content="Devola · NieR · 2024-08-03 · Karaoke! Cute Duck Girl Singing for You!"');
  });

  it('escapes special chars in injected values', () => {
    const r = injectMeta(BASE_HTML, { title: 'A & B', description: '<desc>', url: 'https://x.com/?a=1&b=2' });
    expect(r).toContain('<title>A &amp; B</title>');
    expect(r).toContain('content="&lt;desc&gt;"');
    expect(r).toContain('content="https://x.com/?a=1&amp;b=2"');
  });
});

describe('worker fetch handler', () => {
  it('passes through non-bot requests unchanged', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', HUMAN_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('passes through bot requests missing v param', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?t=7175', BOT_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('passes through bot requests missing t param', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc', BOT_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('injects meta for a bot request with matching v+t', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', BOT_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    expect(html).toContain('<title>Song of the Ancients — Kannaoke</title>');
    expect(html).toContain('Devola · NieR · 2024-08-03 · Karaoke! Cute Duck Girl Singing for You!');
  });

  it('passes through when no entry matches the v+t params', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=9999', BOT_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('passes through when performances data fetch fails', async () => {
    const assets = makeAssets({ dataResponse: new Response(null, { status: 500 }) });
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', BOT_UA);
    await worker.fetch(req, { ASSETS: assets } as never);
    expect(assets.fetch).toHaveBeenCalledWith(req);
  });

  it('recognizes Twitterbot as a bot UA', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', 'Twitterbot/1.0');
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    const html = await resp.text();
    expect(html).toContain('Song of the Ancients — Kannaoke');
  });

  it('sets Content-Type text/html on injected response', async () => {
    const assets = makeAssets();
    const req = makeRequest('/?v=q71H8SzQYFc&t=7175', BOT_UA);
    const resp = await worker.fetch(req, { ASSETS: assets } as never);
    expect(resp.headers.get('Content-Type')).toBe('text/html;charset=UTF-8');
  });
});
